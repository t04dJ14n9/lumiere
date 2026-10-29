import UIKit

/// The window's commands, as the iPad's menu bar and hardware keyboard offer
/// them: the same commands and keys as the desktop app's menu. Each reaches
/// the window by its name (packages/app/src/shell/tauri.ts, `MENU_COMMANDS`;
/// apps/ipad/test/unit/commands.test.ts keeps the two lists the same).
public enum WindowCommand: String, CaseIterable {
    case openVault = "open-vault"
    case openSettings = "open-settings"
    case commandPalette = "command-palette"
    case closeTab = "close-tab"
    case nextTab = "next-tab"
    case previousTab = "previous-tab"
    case lastTab = "last-tab"
    case toggleSidebar = "toggle-sidebar"
    case toggleOutline = "toggle-outline"
    case themeSystem = "theme-system"
    case themeLight = "theme-light"
    case themeDark = "theme-dark"

    var title: String {
        switch self {
        case .openVault: return "Open Folder…"
        case .openSettings: return "Settings…"
        case .commandPalette: return "Command Palette…"
        case .closeTab: return "Close Tab"
        case .nextTab: return "Show Next Tab"
        case .previousTab: return "Show Previous Tab"
        case .lastTab: return "Go to Last Tab"
        case .toggleSidebar: return "Toggle Sidebar"
        case .toggleOutline: return "Toggle Outline"
        case .themeSystem: return "Follow System"
        case .themeLight: return "Light"
        case .themeDark: return "Dark"
        }
    }
}

/// A key for a command (commands.ts, `KEYS`). The first key of a command is
/// the one its menu item shows; the others work without showing.
struct CommandKey {
    let command: WindowCommand
    let input: String
    let modifiers: UIKeyModifierFlags
}

let commandKeys: [CommandKey] = [
    CommandKey(command: .openSettings, input: ",", modifiers: .command),
    CommandKey(command: .commandPalette, input: "p", modifiers: [.command, .shift]),
    CommandKey(command: .openVault, input: "o", modifiers: .command),
    CommandKey(command: .closeTab, input: "w", modifiers: .command),
    // No ⌘B or ⌥⌘B here: inside a note ⌘B is Bold, and a menu key would take
    // it before the page; UIKit's own Format menu has ⌘B too. The window
    // still toggles its panels with them when a note does not have the keys.
    CommandKey(command: .lastTab, input: "\t", modifiers: .control),
    CommandKey(command: .nextTab, input: "]", modifiers: [.command, .shift]),
    CommandKey(command: .previousTab, input: "[", modifiers: [.command, .shift]),
    CommandKey(command: .nextTab, input: UIKeyCommand.inputRightArrow, modifiers: [.command, .alternate]),
    CommandKey(command: .previousTab, input: UIKeyCommand.inputLeftArrow, modifiers: [.command, .alternate]),
    CommandKey(command: .nextTab, input: UIKeyCommand.inputPageDown, modifiers: .control),
    CommandKey(command: .previousTab, input: UIKeyCommand.inputPageUp, modifiers: .control),
]

/// Whoever runs the window's commands: LumiereViewController, found along
/// the responder chain from the web view.
@objc public protocol WindowCommandPerforming {
    func performWindowCommand(_ sender: UICommand)
}

/// The window's commands in the iPad's menu bar (iPadOS 26) and in the list
/// holding ⌘ shows. Call from the app delegate's `buildMenu(with:)`.
public enum WindowMenu {
    public static func build(with builder: UIMenuBuilder) {
        guard builder.system == .main else { return }
        replaceOrAdd(builder, .preferences, menu(.preferences, [.openSettings]), in: .application)
        replaceOrAdd(builder, .close, menu(.close, [.closeTab]), in: .file)
        builder.insertChild(menu(UIMenu.Identifier("lumiere.open"), [.openVault]), atStartOfMenu: .file)
        builder.insertChild(menu(UIMenu.Identifier("lumiere.panels"), [.commandPalette, .toggleSidebar, .toggleOutline]), atStartOfMenu: .view)
        let theme = UIMenu(
            title: "Color Theme",
            identifier: UIMenu.Identifier("lumiere.theme"),
            children: [.themeSystem, .themeLight, .themeDark].map(command)
        )
        builder.insertChild(theme, atEndOfMenu: .view)
        builder.insertChild(
            menu(UIMenu.Identifier("lumiere.tabs"), [.nextTab, .previousTab, .lastTab]),
            atStartOfMenu: .window
        )
    }

    /// iPadOS has a standard Settings item and a standard Close (⌘W closes
    /// the window there); the window's own take their place.
    private static func replaceOrAdd(
        _ builder: UIMenuBuilder, _ identifier: UIMenu.Identifier, _ replacement: UIMenu,
        in parent: UIMenu.Identifier
    ) {
        if builder.menu(for: identifier) != nil {
            builder.replace(menu: identifier, with: replacement)
        } else {
            builder.insertChild(replacement, atEndOfMenu: parent)
        }
    }

    private static func menu(_ identifier: UIMenu.Identifier, _ commands: [WindowCommand]) -> UIMenu {
        UIMenu(title: "", identifier: identifier, options: .displayInline, children: commands.flatMap(items))
    }

    /// The command's menu item, with its first key, and its other keys hidden.
    static func items(for command: WindowCommand) -> [UIMenuElement] {
        let keys = commandKeys.filter { $0.command == command }
        guard let first = keys.first else { return [self.command(command)] }
        let shown = keyCommand(first, title: command.title, variant: 0)
        let hidden = keys.dropFirst().enumerated().map { index, key -> UIKeyCommand in
            let alternate = keyCommand(key, title: command.title, variant: index + 1)
            alternate.attributes = .hidden
            return alternate
        }
        return [shown] + hidden
    }

    private static func command(_ command: WindowCommand) -> UICommand {
        UICommand(
            title: command.title,
            action: #selector(WindowCommandPerforming.performWindowCommand(_:)),
            propertyList: command.rawValue
        )
    }

    /// UIKit refuses two menu items with the same action and property list,
    /// so a command's other keys carry `<command>#<n>` (`init(sender:)`).
    private static func keyCommand(_ key: CommandKey, title: String, variant: Int) -> UIKeyCommand {
        UIKeyCommand(
            title: title,
            action: #selector(WindowCommandPerforming.performWindowCommand(_:)),
            input: key.input,
            modifierFlags: key.modifiers,
            propertyList: variant == 0 ? key.command.rawValue : "\(key.command.rawValue)#\(variant)"
        )
    }
}

extension WindowCommand {
    /// The command a menu item or key carries, if it is one of the window's.
    init?(sender: UICommand) {
        guard let name = sender.propertyList as? String else { return nil }
        self.init(rawValue: String(name.prefix { $0 != "#" }))
    }
}
