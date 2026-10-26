import Capacitor
import UIKit

/// Lumière's window on the iPad: Capacitor's web view, with Lumière's native
/// plugins, the window's commands from the menu bar and the keyboard, and
/// the on-screen keyboard counted as a safe area, so the window shrinks
/// above it and the note being edited stays in view.
open class LumiereViewController: CAPBridgeViewController, WindowCommandPerforming {
    private let windowCommands = WindowCommandsPlugin()
    private var keyboard: KeyboardInset?

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(VaultFileSystemPlugin())
        bridge?.registerPluginInstance(windowCommands)
        keyboard = KeyboardInset(controller: self)
    }

    @objc public func performWindowCommand(_ sender: UICommand) {
        guard let command = WindowCommand(sender: sender) else { return }
        windowCommands.send(command)
    }
}
