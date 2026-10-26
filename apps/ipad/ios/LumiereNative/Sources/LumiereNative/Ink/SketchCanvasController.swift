import PencilKit
import UIKit

/// A sketch's canvas over the whole window: PencilKit's, with the system
/// tool picker, so drawing feels as it does in Notes (pressure, tilt, palm
/// rejection, double-tap and squeeze, hover). The page fills the width,
/// scrolls with a finger, and grows downwards to hold what is drawn below
/// it. Done hands back the drawing and the page's size; Cancel drops them,
/// asking first if anything was drawn.
final class SketchCanvasController: UIViewController, PKCanvasViewDelegate, PKToolPickerObserver {
    struct Result {
        let drawing: PKDrawing
        let size: CGSize
    }

    /// Room kept below the lowest stroke when the page grows.
    static let growthMargin: CGFloat = 32

    private let canvas = PKCanvasView()
    private let toolPicker = PKToolPicker()
    private let paperView: PaperView
    private let initialDrawing: PKDrawing
    private var pageSize: CGSize
    private var completion: ((Result?) -> Void)?
    /// The canvas's own undo history, apart from the note's in the web view.
    private let history = UndoManager()
    private lazy var undoItem = UIBarButtonItem(
        image: UIImage(systemName: "arrow.uturn.backward.circle"), style: .plain, target: self,
        action: #selector(undoStroke))
    private lazy var redoItem = UIBarButtonItem(
        image: UIImage(systemName: "arrow.uturn.forward.circle"), style: .plain, target: self,
        action: #selector(redoStroke))

    init(title: String, drawing: PKDrawing, size: CGSize, paper: StoredPaper, completion: @escaping (Result?) -> Void) {
        initialDrawing = drawing
        pageSize = size
        paperView = PaperView(paper: paper)
        self.completion = completion
        super.init(nibName: nil, bundle: nil)
        self.title = title
        // The ink is stored as drawn on light paper, and the page is light.
        overrideUserInterfaceStyle = .light
        modalPresentationStyle = .fullScreen
        isModalInPresentation = true
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override var undoManager: UndoManager? { history }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemGray5
        setUpCanvas()
        setUpBar()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        toolPicker.setVisible(true, forFirstResponder: canvas)
        canvas.becomeFirstResponder()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        fitPageToWidth()
    }

    // MARK: - Setting up

    private func setUpCanvas() {
        canvas.translatesAutoresizingMaskIntoConstraints = false
        canvas.backgroundColor = .clear
        canvas.isOpaque = false
        canvas.contentInsetAdjustmentBehavior = .never
        canvas.alwaysBounceVertical = true
        // The system's choice, as in Notes: a Pencil draws and a finger
        // scrolls once a Pencil has been used, unless Draw with Finger is on.
        canvas.drawingPolicy = .default
        canvas.drawing = initialDrawing
        canvas.delegate = self
        // Behind the strokes, scrolling with them.
        canvas.insertSubview(paperView, at: 0)
        view.addSubview(canvas)
        NSLayoutConstraint.activate([
            canvas.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            canvas.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            canvas.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            canvas.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
        ])
        toolPicker.colorUserInterfaceStyle = .light
        toolPicker.showsDrawingPolicyControls = true
        // The tools chosen last time, as Notes keeps them.
        toolPicker.stateAutosaveName = "lumiere.sketch"
        toolPicker.addObserver(canvas)
        toolPicker.addObserver(self)
    }

    private func setUpBar() {
        navigationItem.leftBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .cancel, target: self, action: #selector(cancel))
        let done = UIBarButtonItem(barButtonSystemItem: .done, target: self, action: #selector(done))
        undoItem.accessibilityLabel = "Undo"
        redoItem.accessibilityLabel = "Redo"
        navigationItem.rightBarButtonItems = [done, redoItem, undoItem]
        updateHistoryButtons()
    }

    override var keyCommands: [UIKeyCommand]? {
        [
            UIKeyCommand(title: "Cancel", action: #selector(cancel), input: UIKeyCommand.inputEscape),
            UIKeyCommand(title: "Done", action: #selector(done), input: "\r", modifierFlags: .command),
        ]
    }

    // MARK: - The page

    /// The page fills the canvas's width; its height follows at that scale.
    private func fitPageToWidth() {
        guard canvas.bounds.width > 0, pageSize.width > 0 else { return }
        let scale = canvas.bounds.width / pageSize.width
        canvas.minimumZoomScale = scale
        canvas.maximumZoomScale = scale
        canvas.zoomScale = scale
        showPage()
    }

    private func showPage() {
        let scale = canvas.zoomScale
        canvas.contentSize = CGSize(width: pageSize.width * scale, height: pageSize.height * scale)
        paperView.show(size: pageSize, scale: scale)
    }

    /// Strokes drawn below the page take the page down with them.
    private func growPageToFitDrawing() {
        let bounds = canvas.drawing.bounds
        guard !bounds.isNull else { return }
        let needed = SketchCanvasController.pageHeight(holding: bounds, current: pageSize.height)
        guard needed > pageSize.height else { return }
        pageSize.height = needed
        showPage()
    }

    /// The page's height once it holds `drawing`: never shorter than it was.
    static func pageHeight(holding drawing: CGRect, current: CGFloat) -> CGFloat {
        guard !drawing.isNull, drawing.maxY > current else { return current }
        return (drawing.maxY + growthMargin).rounded(.up)
    }

    // MARK: - PKCanvasViewDelegate, PKToolPickerObserver

    func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
        growPageToFitDrawing()
        updateHistoryButtons()
    }

    /// The tool picker covers the bottom of the canvas; the page scrolls clear of it.
    func toolPickerFramesObscuredDidChange(_ toolPicker: PKToolPicker) {
        let obscured = toolPicker.frameObscured(in: canvas)
        let inset = obscured.isNull ? 0 : canvas.bounds.maxY - obscured.minY
        canvas.contentInset.bottom = max(0, inset)
        canvas.verticalScrollIndicatorInsets.bottom = max(0, inset)
    }

    // MARK: - Actions

    @objc private func undoStroke() {
        history.undo()
        updateHistoryButtons()
    }

    @objc private func redoStroke() {
        history.redo()
        updateHistoryButtons()
    }

    private func updateHistoryButtons() {
        undoItem.isEnabled = history.canUndo
        redoItem.isEnabled = history.canRedo
    }

    @objc private func done() {
        finish(with: Result(drawing: canvas.drawing, size: pageSize))
    }

    @objc private func cancel() {
        guard canvas.drawing != initialDrawing else { return finish(with: nil) }
        let ask = UIAlertController(title: nil, message: nil, preferredStyle: .actionSheet)
        ask.addAction(UIAlertAction(title: "Discard Changes", style: .destructive) { [weak self] _ in
            self?.finish(with: nil)
        })
        ask.addAction(UIAlertAction(title: "Keep Drawing", style: .cancel))
        ask.popoverPresentationController?.barButtonItem = navigationItem.leftBarButtonItem
        present(ask, animated: true)
    }

    private func finish(with result: Result?) {
        guard let completion else { return }
        self.completion = nil
        toolPicker.setVisible(false, forFirstResponder: canvas)
        toolPicker.removeObserver(canvas)
        toolPicker.removeObserver(self)
        dismiss(animated: true) { completion(result) }
    }
}
