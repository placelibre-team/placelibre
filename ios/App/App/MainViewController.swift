import UIKit
import Capacitor

/// Contrôleur principal : enregistre le plugin local de détection du stationnement.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(ParkingSignalsPlugin())
    }
}
