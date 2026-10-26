import Capacitor
import Foundation

/// Sends the window the commands chosen in the menu bar or with keys
/// (WindowCommands.swift), and More… and Insert Sketch from the edit menu
/// (EditMenu.swift), as `command` events. The window listens through its backend's
/// `appCommands` (apps/ipad/src/native/window-commands.ts).
@objc(WindowCommandsPlugin)
public class WindowCommandsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WindowCommandsPlugin"
    public let jsName = "LumiereWindowCommands"
    public let pluginMethods: [CAPPluginMethod] = []

    /// The shown note's own menu at its selection: More… in the edit menu.
    static let pageMenu = "page-menu"
    /// A new sketch in the note being edited: Insert Sketch in the edit menu.
    static let insertSketch = "insert-sketch"

    func send(_ command: WindowCommand) {
        send(command.rawValue)
    }

    func sendPageMenu() {
        send(Self.pageMenu)
    }

    func sendInsertSketch() {
        send(Self.insertSketch)
    }

    private func send(_ command: String) {
        // Not kept for later: a command pressed before the window listens
        // has nothing to act on.
        notifyListeners("command", data: ["command": command])
    }
}
