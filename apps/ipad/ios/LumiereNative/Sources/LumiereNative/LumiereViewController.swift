import Capacitor
import UIKit

/// Lumière's window on the iPad: Capacitor's web view, with Lumière's native
/// plugins (vault files, the window's commands, the PencilKit canvas), the
/// window's commands from the menu bar, the keyboard and the edit menu, and
/// the on-screen keyboard counted as a safe area, so the window shrinks
/// above it and the note being edited stays in view.
open class LumiereViewController: CAPBridgeViewController, WindowCommandPerforming {
    private let windowCommands = WindowCommandsPlugin()
    private let vaults = VaultStore.standard()
    private var keyboard: KeyboardInset?
    private var longPressMenu: LongPressEditMenu?
    private var windowControls: WindowControlsInset?

    /// Vault files are served to the web view too, for a note's images
    /// and embeds (VaultRouter).
    override open func router() -> Router {
        VaultRouter(vaults: vaults, fallback: super.router())
    }

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(VaultFileSystemPlugin(store: vaults))
        bridge?.registerPluginInstance(windowCommands)
        bridge?.registerPluginInstance(InkPlugin())
        keyboard = KeyboardInset(controller: self)
        longPressMenu = webView.map(LongPressEditMenu.init(webView:))
        windowControls = webView.map { WindowControlsInset(view: view, webView: $0) }
    }

    /// A window resized, or full screen entered or left, moves iPadOS's
    /// window controls over the page (WindowControlsInset.swift).
    override open func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        windowControls?.update()
    }

    @objc public func performWindowCommand(_ sender: UICommand) {
        guard let command = WindowCommand(sender: sender) else { return }
        windowCommands.send(command)
    }

    /// The edit menu over the web view gets More… (EditMenu.swift); UIKit
    /// asks along the responder chain, which runs from the page to here.
    override open func buildMenu(with builder: UIMenuBuilder) {
        super.buildMenu(with: builder)
        if builder.system == .context {
            // WebKit is showing its menu: the long-press one stays down.
            longPressMenu?.menuBuilt()
        }
        EditMenu.build(
            with: builder,
            more: { [weak self] in self?.windowCommands.sendPageMenu() },
            insertSketch: { [weak self] in self?.windowCommands.sendInsertSketch() }
        )
    }
}
