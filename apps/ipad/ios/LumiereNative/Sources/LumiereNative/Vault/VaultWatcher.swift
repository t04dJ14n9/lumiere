import Foundation

/// Hears about changes other apps make in a vault's folder (Files, a sync
/// client, iCloud), as an `NSFilePresenter`, and reports the changed paths
/// in batches. Changes made without file coordination are not heard; the
/// window also reads the vault again when it comes back to the front.
public final class VaultWatcher: NSObject, NSFilePresenter {
    public let presentedItemURL: URL?
    public let presentedItemOperationQueue: OperationQueue = {
        let queue = OperationQueue()
        queue.maxConcurrentOperationCount = 1
        return queue
    }()

    private let root: URL
    private let onChange: ([String]) -> Void
    private var pending = Set<String>()
    private var isFlushScheduled = false
    /// One save can be several notices (a temporary file, a rename); they go out together.
    private let batchDelay: TimeInterval

    public init(root: URL, batchDelay: TimeInterval = 0.15, onChange: @escaping ([String]) -> Void) {
        self.root = root
        self.presentedItemURL = root
        self.batchDelay = batchDelay
        self.onChange = onChange
    }

    public func start() {
        NSFileCoordinator.addFilePresenter(self)
    }

    public func stop() {
        NSFileCoordinator.removeFilePresenter(self)
    }

    public func presentedSubitemDidChange(at url: URL) {
        note(url)
    }

    public func presentedSubitemDidAppear(at url: URL) {
        note(url)
    }

    public func presentedSubitem(at oldURL: URL, didMoveTo newURL: URL) {
        note(oldURL)
        note(newURL)
    }

    public func accommodatePresentedSubitemDeletion(at url: URL, completionHandler: @escaping (Error?) -> Void) {
        note(url)
        completionHandler(nil)
    }

    /// Runs on the presenter's own queue, so `pending` needs no lock.
    private func note(_ url: URL) {
        guard let path = VaultPath.relative(url, to: root) else { return }
        pending.insert(path)
        guard !isFlushScheduled else { return }
        isFlushScheduled = true
        DispatchQueue.global().asyncAfter(deadline: .now() + batchDelay) { [weak self] in
            self?.presentedItemOperationQueue.addOperation { self?.flush() }
        }
    }

    private func flush() {
        let paths = pending.sorted()
        pending.removeAll()
        isFlushScheduled = false
        if !paths.isEmpty {
            onChange(paths)
        }
    }
}
