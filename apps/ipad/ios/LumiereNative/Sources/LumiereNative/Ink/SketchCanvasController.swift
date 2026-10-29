import PencilKit
import UIKit

/// A sketch's canvas over the whole window: PencilKit's, with the system
/// tool picker, so drawing feels as it does in Notes (pressure, tilt, palm
/// rejection, double-tap and squeeze, hover). Like Freeform it has no edge:
/// the paper goes on in every direction, a finger pans and two pinch to
/// zoom. Done hands back the drawing cut to what was drawn (Board); Cancel
/// drops it, asking first if anything was drawn.
final class SketchCanvasController: UIViewController, PKCanvasViewDelegate, PKToolPickerObserver {
    struct Result {
        let drawing: PKDrawing
        let size: CGSize
    }

    static let zoomRange: ClosedRange<CGFloat> = 0.25...4

    private let canvas = PKCanvasView()
    private let toolPicker = PKToolPicker()
    private let paper: StoredPaper
    private let paperView: PaperView?
    private let board: Board
    private let sketchSize: CGSize
    /// The drawing as opened, on the board.
    private let initialDrawing: PKDrawing
    private var isPlaced = false
    private var completion: ((Result?) -> Void)?
    /// The canvas's own undo history, apart from the note's in the web view.
    private let history = UndoManager()
    private lazy var undoItem = UIBarButtonItem(
        image: UIImage(systemName: "arrow.uturn.backward.circle"), style: .plain, target: self,
        action: #selector(undoStroke))
    private lazy var redoItem = UIBarButtonItem(
        image: UIImage(systemName: "arrow.uturn.forward.circle"), style: .plain, target: self,
        action: #selector(redoStroke))

    /// `drawing` is in the sketch's own points, `size` the sketch's.
    init(title: String, drawing: PKDrawing, size: CGSize, paper: StoredPaper, completion: @escaping (Result?) -> Void) {
        board = Board(sketch: size, spacing: paper.spacing)
        initialDrawing = drawing.transformed(using: board.placing)
        sketchSize = size
        self.paper = paper
        paperView = PaperView.hasMarks(paper) ? PaperView(paper: paper, origin: board.origin) : nil
        self.completion = completion
        super.init(nibName: nil, bundle: nil)
        self.title = title
        // The ink is stored as drawn on light paper, and the paper is light.
        overrideUserInterfaceStyle = .light
        modalPresentationStyle = .fullScreen
        isModalInPresentation = true
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override var undoManager: UndoManager? { history }

    override func viewDidLoad() {
        super.viewDidLoad()
        // A transparent page shows white: the ink is drawn as on light paper.
        view.backgroundColor = paper.color == "none" ? .white : InkColor.color(paper.color)
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
        guard !isPlaced, canvas.bounds.width > 0 else { return }
        isPlaced = true
        showSketch()
    }

    // MARK: - Setting up

    private func setUpCanvas() {
        canvas.translatesAutoresizingMaskIntoConstraints = false
        canvas.backgroundColor = .clear
        canvas.isOpaque = false
        canvas.contentInsetAdjustmentBehavior = .never
        canvas.minimumZoomScale = Self.zoomRange.lowerBound
        canvas.maximumZoomScale = Self.zoomRange.upperBound
        // The system's choice, as in Notes: a Pencil draws and a finger
        // scrolls once a Pencil has been used, unless Draw with Finger is on.
        canvas.drawingPolicy = .default
        canvas.drawing = initialDrawing
        canvas.delegate = self
        if let paperView {
            paperView.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(paperView)
            pin(paperView)
        }
        view.addSubview(canvas)
        pin(canvas)
        toolPicker.colorUserInterfaceStyle = .light
        toolPicker.showsDrawingPolicyControls = true
        // The tools chosen last time, as Notes keeps them.
        toolPicker.stateAutosaveName = "lumiere.sketch"
        toolPicker.addObserver(canvas)
        toolPicker.addObserver(self)
    }

    private func pin(_ subview: UIView) {
        NSLayoutConstraint.activate([
            subview.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            subview.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            subview.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            subview.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
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

    // MARK: - The board

    /// The sketch where the reader left it: whole and centred across, its
    /// top a little below the bar, at its own size unless that is too wide.
    private func showSketch() {
        let width = canvas.bounds.width
        let zoom = min(1, Self.zoomRange.clamp((width - 2 * Board.margin) / max(1, sketchSize.width)))
        canvas.zoomScale = zoom
        updateContentSize()
        canvas.contentOffset = CGPoint(
            x: (board.origin.x + sketchSize.width / 2) * zoom - width / 2,
            y: (board.origin.y - Board.margin) * zoom)
        showPaper()
    }

    private func updateContentSize() {
        let side = board.side * canvas.zoomScale
        if canvas.contentSize.width != side {
            canvas.contentSize = CGSize(width: side, height: side)
        }
    }

    private func showPaper() {
        let zoom = canvas.zoomScale
        let offset = canvas.contentOffset
        paperView?.show(
            visible: CGRect(
                x: offset.x / zoom, y: offset.y / zoom,
                width: canvas.bounds.width / zoom, height: canvas.bounds.height / zoom),
            zoom: zoom)
    }

    // MARK: - PKCanvasViewDelegate, PKToolPickerObserver

    func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
        updateHistoryButtons()
    }

    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        showPaper()
    }

    func scrollViewDidZoom(_ scrollView: UIScrollView) {
        updateContentSize()
        showPaper()
    }

    /// The tool picker covers the bottom of the canvas; the board scrolls clear of it.
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
        let drawing = canvas.drawing
        // A new sketch left blank is not a sketch.
        if drawing.strokes.isEmpty, initialDrawing.strokes.isEmpty { return finish(with: nil) }
        guard let frame = board.frame(holding: drawing.bounds) else {
            return finish(with: Result(drawing: PKDrawing(), size: sketchSize))
        }
        let kept = drawing.transformed(using: CGAffineTransform(translationX: -frame.minX, y: -frame.minY))
        finish(with: Result(drawing: kept, size: frame.size))
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

extension ClosedRange where Bound == CGFloat {
    func clamp(_ value: CGFloat) -> CGFloat { Swift.min(upperBound, Swift.max(lowerBound, value)) }
}
