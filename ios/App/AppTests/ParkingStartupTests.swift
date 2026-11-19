import XCTest
import UIKit
import WebKit
import Capacitor
@testable import App

/// Tests hébergés dans l'app : ils vérifient la fenêtre réellement ouverte par iOS,
/// sans construire eux-mêmes le contrôleur ni enregistrer le plugin à sa place.
final class ParkingStartupTests: XCTestCase {
    @MainActor
    private func launchedController() async throws -> CAPBridgeViewController {
        for _ in 0..<100 {
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            if let root = scenes.flatMap({ $0.windows }).first(where: { $0.isKeyWindow })?.rootViewController {
                return try XCTUnwrap(root as? CAPBridgeViewController, "La scène doit ouvrir le pont natif.")
            }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        XCTFail("Aucune fenêtre principale après le démarrage de l'app.")
        throw NSError(domain: "ParkingStartupTests", code: 1)
    }

    @MainActor
    func testLaunchedSceneRegistersParkingPlugin() async throws {
        let controller = try await launchedController()
        XCTAssertTrue(controller is MainViewController, "SceneDelegate doit utiliser le contrôleur qui enregistre ParkingSignals.")
        XCTAssertTrue(controller.bridge?.plugin(withName: "ParkingSignals") is ParkingSignalsPlugin,
                      "Le plugin doit être enregistré sur le pont de la fenêtre visible.")
    }

    @MainActor
    func testParkingStatusRespondsFromBundledPage() async throws {
        let controller = try await launchedController()
        let webView = try XCTUnwrap(controller.webView)
        // Attend uniquement le script local livré dans l'app, pas les tuiles de la carte.
        var ready = false
        for _ in 0..<150 {
            ready = (try? await webView.evaluateJavaScript(
                "typeof window.PlaceLibreNative?.parkingSignals?.status === 'function'"
            )) as? Bool == true
            if ready { break }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        guard ready else {
            XCTFail("L'adaptateur natif n'est pas disponible dans la page embarquée.")
            return
        }

        // Appel réel JavaScript → Capacitor → Swift → JavaScript. Aucune simulation.
        // status() ne démarre pas la détection et ne publie aucun signalement.
        let response = expectation(description: "Réponse native de ParkingSignals.status")
        webView.callAsyncJavaScript(
            "return await window.PlaceLibreNative.parkingSignals.status();",
            arguments: [:], in: nil, in: .page
        ) { result in
            defer { response.fulfill() }
            switch result {
            case .success(let value):
                guard let status = value as? [String: Any] else {
                    XCTFail("Le plugin doit renvoyer son état.")
                    return
                }
                XCTAssertNotNil(status["running"] as? Bool)
                XCTAssertTrue(["unknown", "whenInUse", "always", "denied"].contains(status["location"] as? String ?? ""))
                XCTAssertTrue(["unavailable", "unknown", "authorized", "denied"].contains(status["motion"] as? String ?? ""))
            case .failure(let error):
                XCTFail("ParkingSignals ne répond pas depuis l'app : \(error)")
            }
        }
        await fulfillment(of: [response], timeout: 10)
    }
}
