import Foundation

/// A place a vault lives: the app's own folder ("Lumière" in Files), or a
/// folder picked in Files (iCloud Drive, a USB drive, another app's
/// storage), kept between launches with a security-scoped bookmark.
public struct VaultInfo: Equatable {
    public static let appFolderId = "app"

    public let id: String
    public let name: String
    public let isAppFolder: Bool

    var json: [String: Any] {
        ["id": id, "name": name, "kind": isAppFolder ? "app" : "folder"]
    }
}

/// The vaults, and access to their folders. A picked folder's bookmark
/// gives access again after a relaunch; access is started once per launch
/// and stopped when the vault is forgotten.
public final class VaultStore {
    private struct Picked: Codable {
        let id: String
        let name: String
        var bookmark: Data
    }

    private let appFolder: URL
    private let listFile: URL
    private var picked: [Picked]
    private var opened: [String: URL] = [:]
    private let lock = NSLock()

    /// `appFolder` is the app's Documents; `dataFolder` keeps the list.
    public init(appFolder: URL, dataFolder: URL) {
        self.appFolder = appFolder
        self.listFile = dataFolder.appendingPathComponent("vaults.json")
        let saved = try? Data(contentsOf: listFile)
        picked = saved.flatMap { try? JSONDecoder().decode([Picked].self, from: $0) } ?? []
    }

    public static func standard() -> VaultStore {
        let manager = FileManager.default
        let documents = manager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let support = manager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Lumiere", isDirectory: true)
        return VaultStore(appFolder: documents, dataFolder: support)
    }

    public func all() -> [VaultInfo] {
        lock.withLock {
            [VaultInfo(id: VaultInfo.appFolderId, name: "Lumière", isAppFolder: true)]
                + picked.map { VaultInfo(id: $0.id, name: $0.name, isAppFolder: false) }
        }
    }

    /// Keeps a folder the reader picked in Files. Picking the same folder
    /// again gives the vault it already is.
    public func add(pickedFolder url: URL) throws -> VaultInfo {
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        let bookmark = try url.bookmarkData()
        let name = url.lastPathComponent
        return try lock.withLock {
            if let known = picked.first(where: { Self.resolve($0.bookmark)?.standardizedFileURL == url.standardizedFileURL }) {
                return VaultInfo(id: known.id, name: known.name, isAppFolder: false)
            }
            let record = Picked(id: "folder-" + UUID().uuidString.lowercased(), name: name, bookmark: bookmark)
            picked.append(record)
            try save()
            return VaultInfo(id: record.id, name: name, isAppFolder: false)
        }
    }

    public func forget(_ id: String) throws {
        try lock.withLock {
            opened.removeValue(forKey: id)?.stopAccessingSecurityScopedResource()
            picked.removeAll { $0.id == id }
            try save()
        }
    }

    /// The vault's folder, with access started for this launch.
    public func root(of id: String) throws -> URL {
        if id == VaultInfo.appFolderId {
            return appFolder
        }
        return try lock.withLock {
            if let url = opened[id] {
                return url
            }
            guard let index = picked.firstIndex(where: { $0.id == id }) else { throw VaultError.unknownVault(id) }
            var isStale = false
            let url = try URL(resolvingBookmarkData: picked[index].bookmark, bookmarkDataIsStale: &isStale)
            _ = url.startAccessingSecurityScopedResource()
            if isStale, let fresh = try? url.bookmarkData() {
                // The folder moved or was renamed; the new bookmark finds it next time.
                picked[index].bookmark = fresh
                try? save()
            }
            opened[id] = url
            return url
        }
    }

    private static func resolve(_ bookmark: Data) -> URL? {
        var isStale = false
        return try? URL(resolvingBookmarkData: bookmark, bookmarkDataIsStale: &isStale)
    }

    private func save() throws {
        try FileManager.default.createDirectory(at: listFile.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONEncoder().encode(picked).write(to: listFile, options: .atomic)
    }
}
