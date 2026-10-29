import Capacitor
import Foundation
import PencilKit

/// The `ink` host service on the iPad: a PencilKit canvas over the window,
/// given a drawing (or none) and giving one back. It knows nothing of notes
/// or files; the TypeScript side (apps/ipad/src/native/ink.ts) decides where
/// a drawing lives. Drawings cross the bridge as the sketch file's metadata
/// JSON (StoredSketch), with PencilKit's own data beside it.
@objc(InkPlugin)
public class InkPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "InkPlugin"
    public let jsName = "LumiereInk"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "capabilities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "draw", returnType: CAPPluginReturnPromise),
    ]

    /// Converting a page of handwriting takes a moment; never on the main thread.
    private let work = DispatchQueue(label: "lumiere.ink", qos: .userInitiated)
    /// Set and read on the main thread.
    private var isDrawing = false

    @objc func capabilities(_ call: CAPPluginCall) {
        call.resolve(["engine": "pencilkit", "pressure": true, "toolPicker": true])
    }

    /// `{title, sketch}`: the sketch as its metadata JSON. Resolves with
    /// `{sketch, pencilKit}` on Done, or `{cancelled: true}`.
    @objc func draw(_ call: CAPPluginCall) {
        let title = call.getString("title") ?? "Sketch"
        guard let json = call.getString("sketch"), let request = InkRequest(json: json) else {
            return call.reject("The sketch to draw on could not be read.", "invalid")
        }
        work.async {
            let drawing = InkConversion.drawing(of: request.sketch)
            DispatchQueue.main.async { self.present(request, drawing: drawing, title: title, call: call) }
        }
    }

    private func present(_ request: InkRequest, drawing: PKDrawing, title: String, call: CAPPluginCall) {
        guard !isDrawing else { return call.reject("A canvas is already open.", "busy") }
        guard let window = bridge?.viewController else { return call.reject("No window to draw in.", "unavailable") }
        isDrawing = true
        let canvas = SketchCanvasController(
            title: title, drawing: drawing, size: request.size, paper: request.sketch.paper
        ) { [weak self] result in
            self?.isDrawing = false
            guard let result else { return call.resolve(["cancelled": true]) }
            self?.work.async { Self.resolve(call, with: result, from: request) }
        }
        let navigation = UINavigationController(rootViewController: canvas)
        navigation.modalPresentationStyle = .fullScreen
        navigation.overrideUserInterfaceStyle = .light
        // Over whatever the window shows now, the edit menu's popover included.
        var top: UIViewController = window
        while let shown = top.presentedViewController, !shown.isBeingDismissed { top = shown }
        top.present(navigation, animated: true)
    }

    private static func resolve(_ call: CAPPluginCall, with result: SketchCanvasController.Result, from request: InkRequest) {
        let sketch = request.drawn(result)
        do {
            call.resolve([
                "sketch": String(decoding: try JSONEncoder().encode(sketch), as: UTF8.self),
                "pencilKit": result.drawing.dataRepresentation().base64EncodedString(),
            ])
        } catch {
            call.reject("The drawing could not be handed back.", "io", error)
        }
    }
}

/// What `draw` was asked for: the sketch, and the page it is drawn on.
struct InkRequest {
    let sketch: StoredSketch

    init?(json: String) {
        guard let sketch = try? JSONDecoder().decode(StoredSketch.self, from: Data(json.utf8)),
            sketch.width > 0, sketch.height > 0
        else { return nil }
        self.sketch = sketch
    }

    var size: CGSize { CGSize(width: sketch.width, height: sketch.height) }

    /// The sketch as drawn: the page's new size and the strokes now on it.
    /// PencilKit's data goes back beside it, for TypeScript to fingerprint.
    func drawn(_ result: SketchCanvasController.Result) -> StoredSketch {
        var drawn = sketch
        drawn.width = Double(result.size.width)
        drawn.height = Double(result.size.height)
        drawn.fields = PortablePoint.fields
        drawn.strokes = InkConversion.strokes(of: result.drawing)
        drawn.pencilKit = nil
        return drawn
    }
}
