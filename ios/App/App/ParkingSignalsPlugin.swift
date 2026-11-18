import Foundation
import Capacitor
import CoreLocation
import CoreMotion
import AVFoundation
import CryptoKit

/// Enregistre, sur le téléphone, les signaux qui servent à deviner quand la voiture se gare ou repart :
/// mouvement (CoreMotion), position (CoreLocation) et sortie audio Bluetooth / CarPlay (AVAudioSession).
/// La page web relit ces signaux avec `drain` : le moteur de décision est dans public/js/detection.js.
/// Rien n'est envoyé hors du téléphone par ce plugin. Les signaux sont gardés 3 h au plus, puis effacés,
/// et tout est effacé à l'arrêt. Aucun nom d'appareil Bluetooth n'est conservé : seulement une empreinte.
@objc(ParkingSignalsPlugin)
public class ParkingSignalsPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "ParkingSignalsPlugin"
    public let jsName = "ParkingSignals"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "drain", returnType: CAPPluginReturnPromise)
    ]

    private static let runningKey = "fr.placelibre.parking.running"
    private static let saltKey = "fr.placelibre.parking.salt"
    private static let keepSeconds: Double = 3 * 3600
    private static let maxSignals = 600

    private var manager: CLLocationManager?
    private let motion = CMMotionActivityManager()
    private var running = false
    private var wantsAlways = false
    private var driving = false
    private var buffer: [[String: Any]] = []
    private var lastSeq = 0
    private var lastActivity = ""
    private var lastConfidence = -1
    private var lastRoute: (kind: String, dev: String)?
    private var persistScheduled = false

    private var fileURL: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("parking-signals.json")
    }

    override public func load() {
        DispatchQueue.main.async {
            self.loadBuffer()
            // L'app peut être relancée en arrière-plan par iOS : on reprend là où on s'était arrêté.
            if UserDefaults.standard.bool(forKey: ParkingSignalsPlugin.runningKey) { self.startInternal() }
        }
    }

    // MARK: méthodes appelées par la page

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            UserDefaults.standard.set(true, forKey: ParkingSignalsPlugin.runningKey)
            self.startInternal()
            call.resolve(self.statusDictionary())
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            UserDefaults.standard.set(false, forKey: ParkingSignalsPlugin.runningKey)
            self.stopInternal()
            call.resolve(self.statusDictionary())
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(self.statusDictionary()) }
    }

    @objc func requestAccess(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let manager = self.locationManager()
            self.wantsAlways = true
            switch manager.authorizationStatus {
            case .notDetermined: manager.requestWhenInUseAuthorization()
            case .authorizedWhenInUse: manager.requestAlwaysAuthorization()
            default: break
            }
            if CMMotionActivityManager.isActivityAvailable() && CMMotionActivityManager.authorizationStatus() == .notDetermined {
                // Une requête passée déclenche la fenêtre d'autorisation « Mouvement et forme ».
                self.motion.queryActivityStarting(from: Date().addingTimeInterval(-60), to: Date(), to: .main) { _, _ in }
            }
            call.resolve(self.statusDictionary())
        }
    }

    @objc func drain(_ call: CAPPluginCall) {
        let after = call.getInt("after") ?? 0
        DispatchQueue.main.async {
            let signals = self.buffer.filter { ($0["seq"] as? Int ?? 0) > after }
            call.resolve(["signals": signals])
        }
    }

    // MARK: démarrage et arrêt

    private func locationManager() -> CLLocationManager {
        if let manager = manager { return manager }
        let created = CLLocationManager()
        created.delegate = self
        created.activityType = .automotiveNavigation
        created.pausesLocationUpdatesAutomatically = true
        created.showsBackgroundLocationIndicator = true
        created.allowsBackgroundLocationUpdates = true       // exige UIBackgroundModes « location » dans Info.plist
        manager = created
        applyAccuracy()
        return created
    }

    private func startInternal() {
        if running { return }
        running = true
        let manager = locationManager()
        manager.startUpdatingLocation()
        if CMMotionActivityManager.isActivityAvailable() {
            motion.startActivityUpdates(to: .main) { [weak self] activity in
                guard let self = self, let activity = activity else { return }
                self.handleMotion(activity)
            }
        }
        NotificationCenter.default.addObserver(self, selector: #selector(routeChanged),
                                               name: AVAudioSession.routeChangeNotification, object: nil)
        lastRoute = nil
        checkRoute()
    }

    private func stopInternal() {
        running = false
        manager?.stopUpdatingLocation()
        motion.stopActivityUpdates()
        NotificationCenter.default.removeObserver(self, name: AVAudioSession.routeChangeNotification, object: nil)
        buffer.removeAll()
        lastRoute = nil
        lastActivity = ""
        lastConfidence = -1
        try? FileManager.default.removeItem(at: fileURL)
    }

    private func statusDictionary() -> [String: Any] {
        var location = "unknown"
        switch locationManager().authorizationStatus {
        case .denied, .restricted: location = "denied"
        case .authorizedWhenInUse: location = "whenInUse"
        case .authorizedAlways: location = "always"
        default: location = "unknown"
        }
        var motionState = "unavailable"
        if CMMotionActivityManager.isActivityAvailable() {
            switch CMMotionActivityManager.authorizationStatus() {
            case .denied, .restricted: motionState = "denied"
            case .authorized: motionState = "authorized"
            default: motionState = "unknown"
            }
        }
        return ["running": running, "location": location, "motion": motionState]
    }

    // MARK: capteurs

    private func handleMotion(_ activity: CMMotionActivity) {
        let kind: String
        if activity.automotive { kind = "automotive" }
        else if activity.cycling { kind = "cycling" }
        else if activity.running { kind = "running" }
        else if activity.walking { kind = "walking" }
        else if activity.stationary { kind = "stationary" }
        else { kind = "unknown" }
        let confidence = activity.confidence == .high ? 2 : (activity.confidence == .medium ? 1 : 0)
        if kind == lastActivity && confidence == lastConfidence { return }
        lastActivity = kind
        lastConfidence = confidence
        let wasDriving = driving
        driving = kind == "automotive"
        if driving != wasDriving { applyAccuracy() }
        record("motion", ["activity": kind, "conf": confidence], at: activity.startDate)
    }

    // Précision adaptée : fine au volant (pour situer l'arrêt), économe le reste du temps.
    private func applyAccuracy() {
        guard let manager = manager else { return }
        if driving {
            manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
            manager.distanceFilter = 5
        } else {
            manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
            manager.distanceFilter = 15
        }
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        for location in locations where location.horizontalAccuracy >= 0 && location.horizontalAccuracy <= 100 {
            record("position", [
                "lat": location.coordinate.latitude,
                "lng": location.coordinate.longitude,
                "acc": location.horizontalAccuracy,
                "speed": location.speed >= 0 ? location.speed : NSNull()
            ], at: location.timestamp)
        }
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        // iOS demande « Toujours » dans un second temps, après « Pendant l'utilisation ».
        if wantsAlways && manager.authorizationStatus == .authorizedWhenInUse { manager.requestAlwaysAuthorization() }
        if running && (manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways) {
            manager.startUpdatingLocation()
        }
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}

    @objc private func routeChanged(_ notification: Notification) {
        DispatchQueue.main.async { self.checkRoute() }
    }

    private func currentRoute() -> (kind: String, dev: String)? {
        for output in AVAudioSession.sharedInstance().currentRoute.outputs {
            switch output.portType {
            case .carAudio: return ("carplay", fingerprint(output.uid))
            case .bluetoothA2DP, .bluetoothHFP, .bluetoothLE: return ("bluetooth", fingerprint(output.uid))
            default: continue
            }
        }
        return nil
    }

    private func checkRoute() {
        let now = currentRoute()
        if let old = lastRoute, now == nil || now!.dev != old.dev {
            record("audio", ["connected": false, "kind": old.kind, "dev": old.dev])
        }
        if let current = now, lastRoute == nil || lastRoute!.dev != current.dev {
            record("audio", ["connected": true, "kind": current.kind, "dev": current.dev])
        }
        lastRoute = now
    }

    /// Empreinte courte et propre à ce téléphone : permet de reconnaître l'appareil sans jamais garder son nom.
    private func fingerprint(_ uid: String) -> String {
        let defaults = UserDefaults.standard
        var salt = defaults.string(forKey: ParkingSignalsPlugin.saltKey)
        if salt == nil {
            salt = UUID().uuidString
            defaults.set(salt, forKey: ParkingSignalsPlugin.saltKey)
        }
        let digest = SHA256.hash(data: Data((salt! + uid).utf8))
        return digest.prefix(4).map { String(format: "%02x", $0) }.joined()
    }

    // MARK: enregistrement

    private func record(_ type: String, _ fields: [String: Any], at date: Date = Date()) {
        var item = fields
        let nowMs = Int(Date().timeIntervalSince1970 * 1000)
        item["type"] = type
        item["t"] = min(Int(date.timeIntervalSince1970 * 1000), nowMs)
        lastSeq = max(lastSeq + 1, nowMs)                    // croissant même si le fichier est perdu
        item["seq"] = lastSeq
        buffer.append(item)
        let limit = nowMs - Int(ParkingSignalsPlugin.keepSeconds * 1000)
        buffer.removeAll { ($0["t"] as? Int ?? 0) < limit }
        if buffer.count > ParkingSignalsPlugin.maxSignals { buffer.removeFirst(buffer.count - ParkingSignalsPlugin.maxSignals) }
        schedulePersist()
        notifyListeners("signal", data: item)
    }

    private func schedulePersist() {
        if persistScheduled { return }
        persistScheduled = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 10) {
            self.persistScheduled = false
            guard self.running else { return }
            let snapshot = self.buffer
            let url = self.fileURL
            DispatchQueue.global(qos: .utility).async {
                guard JSONSerialization.isValidJSONObject(snapshot),
                      let data = try? JSONSerialization.data(withJSONObject: snapshot) else { return }
                try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
                try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            }
        }
    }

    private func loadBuffer() {
        guard let data = try? Data(contentsOf: fileURL),
              let items = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return }
        buffer = items
        lastSeq = items.compactMap { $0["seq"] as? Int }.max() ?? 0
    }
}
