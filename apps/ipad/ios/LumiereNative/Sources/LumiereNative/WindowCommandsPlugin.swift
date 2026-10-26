import Capacitor
import Foundation

/// Sends the window the commands chosen in the menu bar or with keys
/// (WindowCommands.swift), as `command` events. The window listens with
/// `Capacitor.Plugins.LumiereWindowCommands.addListener("command", …)`
/// (packages/app/src/shell/capacitor.ts).
@objc(WindowCommandsPlugin)
public class WindowCommandsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WindowCommandsPlugin"
    public let jsName = "LumiereWindowCommands"
    public let pluginMethods: [CAPPluginMethod] = []

    func send(_ command: WindowCommand) {
        // Not kept for later: a command pressed before the window listens
        // has nothing to act on.
        notifyListeners("command", data: ["command": command.rawValue])
    }
}
