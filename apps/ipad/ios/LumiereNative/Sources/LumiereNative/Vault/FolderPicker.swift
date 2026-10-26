import UIKit
import UniformTypeIdentifiers

/// Files' folder picker, for a vault anywhere Files reaches. Keeps itself
/// alive while it shows; answers once, with the folder or nil.
final class FolderPicker: NSObject, UIDocumentPickerDelegate {
    private var done: ((URL?) -> Void)?
    private var keepAlive: FolderPicker?

    static func show(from controller: UIViewController, done: @escaping (URL?) -> Void) {
        let picker = FolderPicker()
        picker.done = done
        picker.keepAlive = picker
        let view = UIDocumentPickerViewController(forOpeningContentTypes: [.folder], asCopy: false)
        view.delegate = picker
        view.allowsMultipleSelection = false
        controller.present(view, animated: true)
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        finish(urls.first)
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        finish(nil)
    }

    private func finish(_ url: URL?) {
        done?(url)
        done = nil
        keepAlive = nil
    }
}
