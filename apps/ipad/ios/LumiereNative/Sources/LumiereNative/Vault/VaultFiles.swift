import Foundation

/// One file or folder, as the window sees it.
public struct VaultEntry: Equatable {
    public let path: String
    public let isFolder: Bool
    public let size: Int
    /// Milliseconds since 1970, as JavaScript's `Date` counts.
    public let modified: Double

    var json: [String: Any] {
        ["path": path, "kind": isFolder ? "folder" : "file", "size": size, "modified": modified]
    }
}

/// A vault's files, read and written through `NSFileCoordinator`, so other
/// apps editing the same folder (Files, Obsidian, a sync client) and iCloud
/// see each change whole, and a file only in the cloud downloads before it
/// is read. Paths are checked by VaultPath. Runs on any thread but the main
/// one: coordination may wait.
public final class VaultFiles {
    public let root: URL
    /// Coordinating as the vault's watcher keeps it from hearing its own writes.
    private weak var presenter: NSFilePresenter?

    public init(root: URL, presenter: NSFilePresenter? = nil) {
        self.root = root
        self.presenter = presenter
    }

    /// Everything under `path`, folders included; `skipping` names folders
    /// (like `.git`) whose contents are not listed.
    public func list(_ path: String, skipping: Set<String> = []) throws -> [VaultEntry] {
        let folder = try VaultPath.url(for: path, in: root)
        let keys: [URLResourceKey] = [.isDirectoryKey, .fileSizeKey, .contentModificationDateKey]
        var entries: [VaultEntry] = []
        try coordinate(reading: folder) { url in
            guard let walker = FileManager.default.enumerator(at: url, includingPropertiesForKeys: keys) else {
                throw VaultError.notFound(path)
            }
            for case let item as URL in walker {
                guard let entry = self.entry(at: item) else { continue }
                if entry.isFolder, skipping.contains(item.lastPathComponent) {
                    walker.skipDescendants()
                }
                entries.append(entry)
            }
        }
        return entries
    }

    public func stat(_ path: String) throws -> VaultEntry? {
        entry(at: try VaultPath.url(for: path, in: root))
    }

    public func read(_ path: String) throws -> (data: Data, entry: VaultEntry) {
        let url = try VaultPath.url(for: path, in: root)
        var result: (Data, VaultEntry)?
        try coordinate(reading: url) { url in
            guard let entry = self.entry(at: url), !entry.isFolder else { throw VaultError.notFound(path) }
            result = (try Data(contentsOf: url), entry)
        }
        guard let result else { throw VaultError.notFound(path) }
        return result
    }

    /// Writes the whole file, creating its folders. With `ifModified`, the
    /// write happens only if the file still has that modification time:
    /// nothing written elsewhere since it was read is overwritten.
    public func write(_ path: String, data: Data, ifModified: Double? = nil) throws -> VaultEntry {
        let url = try VaultPath.url(for: path, in: root)
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try coordinate(writing: url, options: .forReplacing) { url in
            if let expected = ifModified, let current = self.entry(at: url), abs(current.modified - expected) > 1 {
                throw VaultError.changedOnDisk(path)
            }
            try data.write(to: url, options: .atomic)
        }
        guard let entry = entry(at: url) else { throw VaultError.notFound(path) }
        return entry
    }

    public func createFolder(_ path: String) throws {
        let url = try VaultPath.url(for: path, in: root)
        try coordinate(writing: url, options: []) { url in
            try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        }
    }

    /// Moves a file or folder; the window moves deleted notes to `.trash`
    /// this way, as Obsidian does.
    public func rename(from: String, to: String) throws {
        let source = try VaultPath.url(for: from, in: root)
        let destination = try VaultPath.url(for: to, in: root)
        guard entry(at: source) != nil else { throw VaultError.notFound(from) }
        try FileManager.default.createDirectory(
            at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
        let coordinator = NSFileCoordinator(filePresenter: presenter)
        var failure: Error?
        var coordination: NSError?
        coordinator.coordinate(
            writingItemAt: source, options: .forMoving, writingItemAt: destination, options: .forReplacing,
            error: &coordination
        ) { from, to in
            do {
                try FileManager.default.moveItem(at: from, to: to)
                coordinator.item(at: from, didMoveTo: to)
            } catch {
                failure = error
            }
        }
        if let error = coordination ?? failure { throw error }
    }

    public func remove(_ path: String) throws {
        let url = try VaultPath.url(for: path, in: root)
        guard !path.isEmpty else { throw VaultError.invalidPath(path) }
        try coordinate(writing: url, options: .forDeleting) { url in
            try FileManager.default.removeItem(at: url)
        }
    }

    private func entry(at url: URL) -> VaultEntry? {
        guard
            let relative = VaultPath.relative(url, to: root),
            let values = try? url.resourceValues(forKeys: [.isDirectoryKey, .fileSizeKey, .contentModificationDateKey])
        else { return nil }
        return VaultEntry(
            path: relative,
            isFolder: values.isDirectory ?? false,
            size: values.fileSize ?? 0,
            modified: (values.contentModificationDate?.timeIntervalSince1970 ?? 0) * 1000
        )
    }

    private func coordinate(reading url: URL, _ body: (URL) throws -> Void) throws {
        var failure: Error?
        var coordination: NSError?
        NSFileCoordinator(filePresenter: presenter).coordinate(readingItemAt: url, options: [], error: &coordination) {
            url in
            do { try body(url) } catch { failure = error }
        }
        if let error = coordination ?? failure { throw error }
    }

    private func coordinate(
        writing url: URL, options: NSFileCoordinator.WritingOptions, _ body: (URL) throws -> Void
    ) throws {
        var failure: Error?
        var coordination: NSError?
        NSFileCoordinator(filePresenter: presenter).coordinate(writingItemAt: url, options: options, error: &coordination) {
            url in
            do { try body(url) } catch { failure = error }
        }
        if let error = coordination ?? failure { throw error }
    }
}
