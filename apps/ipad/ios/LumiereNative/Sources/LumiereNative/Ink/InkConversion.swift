import PencilKit

/// PencilKit's drawings as the sketch file's portable strokes, and back.
/// Each stored point is one `PKStrokePoint`, placed by its stroke's
/// transform, so another engine draws the stroke as PencilKit did. The
/// iPad reopens a sketch from PencilKit's own data when the file still has
/// it, and rebuilds the drawing from the strokes when it does not.
enum InkConversion {
    /// PencilKit's force when a Pencil presses as hard as it reads
    /// (`UITouch.maximumPossibleForce` for Apple Pencil). The file keeps
    /// force from 0 to 1, as Pointer Events do.
    static let maximumForce: CGFloat = 25.0 / 6.0

    /// PencilKit's inks by the names the file gives them (types.ts, `INK_TOOLS`).
    static let inks: [(name: String, type: PKInk.InkType)] = {
        var inks: [(name: String, type: PKInk.InkType)] = [
            ("pen", .pen), ("fountainPen", .fountainPen), ("pencil", .pencil), ("marker", .marker),
            ("monoline", .monoline), ("watercolor", .watercolor), ("crayon", .crayon),
        ]
        if #available(iOS 26.0, *) {
            inks.append(("reed", .reed))
        }
        return inks
    }()

    static func name(of type: PKInk.InkType) -> String {
        inks.first { $0.type == type }?.name ?? "pen"
    }

    /// An ink the file names; one this iPad lacks draws as the pen.
    static func type(named name: String) -> PKInk.InkType {
        inks.first { $0.name == name }?.type ?? .pen
    }

    // MARK: - From PencilKit

    static func strokes(of drawing: PKDrawing) -> [StoredStroke] {
        drawing.strokes.flatMap(storedStrokes)
    }

    /// A stroke the pixel eraser cut keeps only what still shows, each
    /// visible part as a stroke of its own.
    private static func storedStrokes(_ stroke: PKStroke) -> [StoredStroke] {
        let tool = name(of: stroke.ink.inkType)
        let color = InkColor.hex(stroke.ink.color)
        let placement = Placement(stroke.transform)
        let parts: [[PKStrokePoint]] =
            stroke.mask == nil
            ? [Array(stroke.path)]
            : stroke.maskedPathRanges.map { Array(stroke.path.interpolatedPoints(in: $0, by: .parametricStep(1))) }
        return parts.filter { !$0.isEmpty }.map { points in
            StoredStroke(tool: tool, color: color, points: points.flatMap { placement.point($0).values })
        }
    }

    // MARK: - To PencilKit

    /// The drawing a stored sketch holds: PencilKit's own data when it has
    /// some this iPad reads, else rebuilt from the portable strokes.
    static func drawing(of sketch: StoredSketch) -> PKDrawing {
        if let stored = sketch.pencilKit, let data = Data(base64Encoded: stored.data),
            let drawing = try? PKDrawing(data: data)
        {
            return drawing
        }
        let columns = PointColumns(sketch.fields)
        return PKDrawing(strokes: sketch.strokes.compactMap { stroke($0, columns) })
    }

    private static func stroke(_ stored: StoredStroke, _ columns: PointColumns) -> PKStroke? {
        let points = columns.points(stored.points)
        guard !points.isEmpty else { return nil }
        let ink = PKInk(type(named: stored.tool), color: InkColor.color(stored.color))
        let path = PKStrokePath(controlPoints: points.map(strokePoint), creationDate: Date())
        return PKStroke(ink: ink, path: path)
    }

    private static func strokePoint(_ point: PortablePoint) -> PKStrokePoint {
        PKStrokePoint(
            location: CGPoint(x: point.x, y: point.y),
            timeOffset: point.t,
            size: CGSize(width: point.width, height: point.width),
            opacity: point.opacity,
            force: point.force * maximumForce,
            azimuth: point.azimuth,
            altitude: point.altitude
        )
    }
}

/// Where a stroke's transform puts its points: moved, turned and scaled by
/// the lasso. Widths scale and azimuths turn with it.
struct Placement {
    let transform: CGAffineTransform
    let scale: CGFloat
    let turn: CGFloat

    init(_ transform: CGAffineTransform) {
        self.transform = transform
        scale = sqrt(abs(transform.a * transform.d - transform.b * transform.c))
        turn = atan2(transform.b, transform.a)
    }

    func point(_ point: PKStrokePoint) -> PortablePoint {
        let location = point.location.applying(transform)
        return PortablePoint(
            x: location.x,
            y: location.y,
            t: point.timeOffset,
            force: min(1, max(0, point.force / InkConversion.maximumForce)),
            altitude: point.altitude,
            azimuth: point.azimuth + turn,
            // The nib's mean diameter: PencilKit's tip is round for most
            // inks; the fountain pen's is an ellipse, kept exactly in its data.
            width: (point.size.width + point.size.height) / 2 * scale,
            opacity: point.opacity
        )
    }
}
