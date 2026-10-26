import Capacitor
import Foundation

/// The `VaultFileSystem` host service on the iPad: vaults and their files,
/// for host-web. The window names files by vault id and a "/"-separated
/// path inside it; every path is checked again here (VaultPath). Text is
/// UTF-8; anything else travels as base64. The TypeScript side is
/// apps/ipad/src/native/vault-files.ts.
@objc(VaultFileSystemPlugin)
public class VaultFileSystemPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VaultFileSystemPlugin"
    public let jsName = "LumiereVaultFiles"
    public let pluginMethods: [CAPPluginMethod] = [
        "vaults", "pickFolder", "forget", "list", "stat", "read", "write", "createFolder", "rename", "remove",
        "watch", "unwatch",
    ].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }

    private let store = VaultStore.standard()
    private var watchers: [String: VaultWatcher] = [:]
    /// File work waits on coordination, so it never runs on the main thread.
    private let work = DispatchQueue(label: "lumiere.vault-files", qos: .userInitiated, attributes: .concurrent)

    @objc func vaults(_ call: CAPPluginCall) {
        call.resolve(["vaults": store.all().map(\.json)])
    }

    @objc func pickFolder(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let controller = self.bridge?.viewController else { return call.reject("No window to show Files in.") }
            FolderPicker.show(from: controller) { url in
                guard let url else { return call.resolve(["cancelled": true]) }
                self.run(call) { ["vault": try self.store.add(pickedFolder: url).json] }
            }
        }
    }

    @objc func forget(_ call: CAPPluginCall) {
        run(call) {
            let id = try self.vaultId(call)
            DispatchQueue.main.sync { self.watchers.removeValue(forKey: id)?.stop() }
            try self.store.forget(id)
            return [:]
        }
    }

    @objc func list(_ call: CAPPluginCall) {
        run(call) {
            let skipping = Set(call.getArray("skipping", String.self) ?? [])
            let entries = try self.files(call).list(
                call.getString("path") ?? "", skipping: skipping, shallow: call.getBool("shallow") ?? false)
            return ["entries": entries.map(\.json)]
        }
    }

    @objc func stat(_ call: CAPPluginCall) {
        run(call) {
            let entry = try self.files(call).stat(try self.path(call))
            return ["entry": entry?.json ?? NSNull()]
        }
    }

    @objc func read(_ call: CAPPluginCall) {
        run(call) {
            let path = try self.path(call)
            let (data, entry) = try self.files(call).read(path)
            return ["data": try Self.encode(data, as: call.getString("encoding"), path: path), "entry": entry.json]
        }
    }

    @objc func write(_ call: CAPPluginCall) {
        run(call) {
            let path = try self.path(call)
            let data = try Self.decode(call.getString("data") ?? "", as: call.getString("encoding"), path: path)
            let entry = try self.files(call).write(path, data: data, ifModified: call.getDouble("ifModified"))
            return ["entry": entry.json]
        }
    }

    @objc func createFolder(_ call: CAPPluginCall) {
        run(call) {
            try self.files(call).createFolder(try self.path(call))
            return [:]
        }
    }

    @objc func rename(_ call: CAPPluginCall) {
        run(call) {
            guard let from = call.getString("from"), let to = call.getString("to") else {
                throw VaultError.invalidPath("")
            }
            try self.files(call).rename(from: from, to: to)
            return [:]
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        run(call) {
            try self.files(call).remove(try self.path(call))
            return [:]
        }
    }

    /// Change notices for a vault, as `change` events: `{vault, paths}`.
    @objc func watch(_ call: CAPPluginCall) {
        run(call) {
            let id = try self.vaultId(call)
            let root = try self.store.root(of: id)
            DispatchQueue.main.sync {
                guard self.watchers[id] == nil else { return }
                let watcher = VaultWatcher(root: root) { [weak self] paths in
                    self?.notifyListeners("change", data: ["vault": id, "paths": paths])
                }
                watcher.start()
                self.watchers[id] = watcher
            }
            return [:]
        }
    }

    @objc func unwatch(_ call: CAPPluginCall) {
        run(call) {
            let id = try self.vaultId(call)
            DispatchQueue.main.sync { self.watchers.removeValue(forKey: id)?.stop() }
            return [:]
        }
    }

    // MARK: - Calls

    private func run(_ call: CAPPluginCall, _ body: @escaping () throws -> [String: Any]) {
        work.async {
            do {
                call.resolve(try body())
            } catch let error as VaultError {
                call.reject(error.localizedDescription, error.code)
            } catch {
                call.reject(error.localizedDescription, "io", error)
            }
        }
    }

    private func vaultId(_ call: CAPPluginCall) throws -> String {
        guard let id = call.getString("vault") else { throw VaultError.unknownVault("") }
        return id
    }

    private func path(_ call: CAPPluginCall) throws -> String {
        guard let path = call.getString("path") else { throw VaultError.invalidPath("") }
        return path
    }

    /// The vault's files, coordinated as its watcher when there is one.
    private func files(_ call: CAPPluginCall) throws -> VaultFiles {
        let id = try vaultId(call)
        let presenter = DispatchQueue.main.sync { watchers[id] }
        return VaultFiles(root: try store.root(of: id), presenter: presenter)
    }

    static func encode(_ data: Data, as encoding: String?, path: String) throws -> String {
        if encoding == "base64" {
            return data.base64EncodedString()
        }
        guard let text = String(data: data, encoding: .utf8) else { throw VaultError.unreadable(path) }
        return text
    }

    static func decode(_ text: String, as encoding: String?, path: String) throws -> Data {
        if encoding == "base64" {
            guard let data = Data(base64Encoded: text) else { throw VaultError.unreadable(path) }
            return data
        }
        return Data(text.utf8)
    }
}
