import Capacitor
import UIKit

/// Lumière's window on the iPad: Capacitor's web view, with Lumière's native
/// plugins, the window's commands from the menu bar, the keyboard and the
/// edit menu, and the on-screen keyboard counted as a safe area, so the
/// window shrinks above it and the note being edited stays in view.
open class LumiereViewController: CAPBridgeViewController, WindowCommandPerforming {
    private let windowCommands = WindowCommandsPlugin()
    private let vaults = VaultStore.standard()
    private var keyboard: KeyboardInset?

    /// Vault files are served to the web view too, for a note's images
    /// and embeds (VaultRouter).
    override open func router() -> Router {
        VaultRouter(vaults: vaults, fallback: super.router())
    }

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(VaultFileSystemPlugin(store: vaults))
        bridge?.registerPluginInstance(windowCommands)
        keyboard = KeyboardInset(controller: self)
    }

    @objc public func performWindowCommand(_ sender: UICommand) {
        guard let command = WindowCommand(sender: sender) else { return }
        windowCommands.send(command)
    }

    /// The edit menu over the web view gets More… (EditMenu.swift); UIKit
    /// asks along the responder chain, which runs from the page to here.
    override open func buildMenu(with builder: UIMenuBuilder) {
        super.buildMenu(with: builder)
        EditMenu.build(with: builder) { [weak self] in
            self?.windowCommands.sendPageMenu()
        }
    }
}
