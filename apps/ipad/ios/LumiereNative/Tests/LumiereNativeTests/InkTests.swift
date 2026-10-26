import PencilKit
import XCTest
@testable import LumiereNative

/// A sketch as TypeScript's `encodeSketch` writes it (packages/ink).
private let storedJSON = """
    {"format":"lumiere-sketch","version":1,"width":720,"height":480,\
    "paper":{"style":"ruled","spacing":32,"color":"#ffffff"},\
    "fields":["x","y","t","force","altitude","azimuth","width","opacity"],\
    "strokes":[{"tool":"fountainPen","color":"#1f2328cc","points":[10,20,0,0.25,1.2,0.5,2,1,30,40,0.016,0.75,1.1,0.6,4,0.9]}]}
    """

private func point(_ x: CGFloat, force: CGFloat, size: CGFloat) -> PKStrokePoint {
    PKStrokePoint(
        location: CGPoint(x: x, y: 50), timeOffset: TimeInterval(x / 1000), size: CGSize(width: size, height: size),
        opacity: 0.8, force: force, azimuth: 0.5, altitude: 1.2)
}

private func stroke(_ ink: PKInk.InkType = .pen, transform: CGAffineTransform = .identity) -> PKStroke {
    let path = PKStrokePath(
        controlPoints: [point(10, force: 1, size: 2), point(60, force: 4, size: 6), point(110, force: 1, size: 2)],
        creationDate: Date())
    return PKStroke(ink: PKInk(ink, color: .systemRed), path: path, transform: transform, mask: nil)
}

final class StoredSketchTests: XCTestCase {
    func testReadsTheSketchTypeScriptWrites() throws {
        let sketch = try JSONDecoder().decode(StoredSketch.self, from: Data(storedJSON.utf8))
        XCTAssertEqual(sketch.width, 720)
        XCTAssertEqual(sketch.paper, StoredPaper(style: "ruled", spacing: 32, color: "#ffffff"))
        XCTAssertEqual(sketch.strokes.first?.tool, "fountainPen")
        XCTAssertNil(sketch.pencilKit)
        let points = PointColumns(sketch.fields).points(sketch.strokes[0].points)
        XCTAssertEqual(points.count, 2)
        XCTAssertEqual(points[1], PortablePoint(x: 30, y: 40, t: 0.016, force: 0.75, altitude: 1.1, azimuth: 0.6, width: 4, opacity: 0.9))
    }

    /// Fields are found by name, as TypeScript finds them: a later version's
    /// extra fields are skipped, and missing optional ones take defaults.
    func testFindsFieldsByName() {
        let columns = PointColumns(["width", "y", "x", "roll"])
        XCTAssertEqual(
            columns.points([3, 20, 10, 0.4]),
            [PortablePoint(x: 10, y: 20, t: 0, force: 0.5, altitude: .pi / 2, azimuth: 0, width: 3, opacity: 1)])
    }

    func testADamagedStrokeReadsAsNone() {
        XCTAssertEqual(PointColumns(PortablePoint.fields).points([1, 2, 3]), [])
        XCTAssertEqual(PointColumns(["x", "y"]).points([1, 2]), [], "no width")
        XCTAssertEqual(PointColumns([]).points([]), [])
    }

    func testTheFieldsAreTypeScripts() {
        XCTAssertEqual(PortablePoint.fields, ["x", "y", "t", "force", "altitude", "azimuth", "width", "opacity"])
    }
}

final class InkColorTests: XCTestCase {
    func testWritesHexAsDrawnOnLightPaper() {
        XCTAssertEqual(InkColor.hex(UIColor(red: 1, green: 0, blue: 0, alpha: 1)), "#ff0000")
        XCTAssertEqual(InkColor.hex(UIColor(red: 0, green: 0, blue: 1, alpha: 0.5)), "#0000ff80")
        // PencilKit's default black is `label`-like: dark in light mode.
        let dynamic = UIColor { $0.userInterfaceStyle == .dark ? .white : .black }
        XCTAssertEqual(InkColor.hex(dynamic), "#000000")
        // A Display P3 red beyond sRGB is clamped, not wrapped.
        XCTAssertEqual(InkColor.hex(UIColor(displayP3Red: 1, green: 0, blue: 0, alpha: 1)), "#ff0000")
    }

    func testReadsHexAndRefusesAnythingElse() {
        XCTAssertEqual(InkColor.hex(InkColor.color("#1f2328")), "#1f2328")
        XCTAssertEqual(InkColor.hex(InkColor.color("#1f2328cc")), "#1f2328cc")
        XCTAssertEqual(InkColor.hex(InkColor.color("red")), "#000000")
        XCTAssertEqual(InkColor.hex(InkColor.color("#12345")), "#000000")
    }
}

final class InkConversionTests: XCTestCase {
    /// Each point keeps the Pencil's input, force on Pointer Events' 0…1
    /// scale, and the width the ink drew there: a harder press is wider.
    func testKeepsEveryPointWithItsPressureAndWidth() throws {
        let stored = InkConversion.strokes(of: PKDrawing(strokes: [stroke()]))
        XCTAssertEqual(stored.count, 1)
        XCTAssertEqual(stored[0].tool, "pen")
        XCTAssertEqual(stored[0].color, InkColor.hex(.systemRed))
        let points = PointColumns(PortablePoint.fields).points(stored[0].points)
        XCTAssertEqual(points.map(\.x), [10, 60, 110])
        XCTAssertEqual(points.map(\.width), [2, 6, 2])
        XCTAssertEqual(points[1].force, 1, accuracy: 0.05, "a hard press is near 1")
        XCTAssertEqual(points[0].force, 0.24, accuracy: 0.01)
        // PencilKit keeps angles to about a thousandth of a radian.
        XCTAssertEqual(points[0].altitude, 1.2, accuracy: 1e-3)
        XCTAssertEqual(points[0].opacity, 0.8, accuracy: 1e-6)
        XCTAssertEqual(points[2].t, 0.11, accuracy: 1e-6)
    }

    /// A lasso move, turn or resize is the stroke's transform: the file keeps
    /// where the points ended up, wider when scaled up, turned azimuths.
    func testPlacesPointsWhereTheLassoLeftThem() throws {
        let moved = CGAffineTransform(translationX: 100, y: 10).scaledBy(x: 2, y: 2).rotated(by: .pi / 2)
        let stored = InkConversion.strokes(of: PKDrawing(strokes: [stroke(transform: moved)]))
        let points = PointColumns(PortablePoint.fields).points(stored[0].points)
        let expected = CGPoint(x: 10, y: 50).applying(moved)
        XCTAssertEqual(points[0].x, expected.x, accuracy: 1e-6)
        XCTAssertEqual(points[0].y, expected.y, accuracy: 1e-6)
        XCTAssertEqual(points[1].width, 12, accuracy: 1e-6)
        XCTAssertEqual(points[0].azimuth, 0.5 + .pi / 2, accuracy: 1e-3)
    }

    /// What the pixel eraser cut away is not in the file.
    func testKeepsOnlyWhatThePixelEraserLeft() throws {
        let path = PKStrokePath(
            controlPoints: stride(from: 0, through: 200, by: 10).map { point(CGFloat($0), force: 1, size: 4) },
            creationDate: Date())
        let kept = UIBezierPath(rect: CGRect(x: -10, y: 0, width: 80, height: 100))
        let erased = PKStroke(ink: PKInk(.pen, color: .black), path: path, transform: .identity, mask: kept)
        let stored = InkConversion.strokes(of: PKDrawing(strokes: [erased]))
        let points = stored.flatMap { PointColumns(PortablePoint.fields).points($0.points) }
        XCTAssertFalse(points.isEmpty)
        XCTAssertTrue(points.allSatisfy { $0.x <= 80 }, "\(points.map(\.x))")
    }

    func testNamesEveryInkAsTheFileDoes() {
        for (name, type) in InkConversion.inks {
            XCTAssertEqual(InkConversion.name(of: type), name)
            XCTAssertEqual(InkConversion.type(named: name), type)
        }
        XCTAssertEqual(InkConversion.type(named: "quill"), .pen)
        XCTAssertEqual(
            Set(InkConversion.inks.map(\.name)).isSuperset(of: [
                "pen", "fountainPen", "pencil", "marker", "monoline", "watercolor", "crayon",
            ]), true)
    }

    /// Without PencilKit's data (edited elsewhere), the drawing is rebuilt
    /// from the strokes, point for point.
    func testRebuildsTheDrawingFromTheStrokes() throws {
        var sketch = try JSONDecoder().decode(StoredSketch.self, from: Data(storedJSON.utf8))
        sketch.pencilKit = nil
        let drawing = InkConversion.drawing(of: sketch)
        XCTAssertEqual(drawing.strokes.count, 1)
        let rebuilt = drawing.strokes[0]
        XCTAssertEqual(rebuilt.ink.inkType, .fountainPen)
        XCTAssertEqual(InkColor.hex(rebuilt.ink.color), "#1f2328cc")
        XCTAssertEqual(Array(rebuilt.path).count, 2)
        XCTAssertEqual(rebuilt.path[1].location, CGPoint(x: 30, y: 40))
        XCTAssertEqual(rebuilt.path[1].size.width, 4, accuracy: 1e-6)
        XCTAssertEqual(rebuilt.path[1].force, 0.75 * InkConversion.maximumForce, accuracy: 1e-6)
        let again = InkConversion.strokes(of: drawing)
        let points = PointColumns(PortablePoint.fields).points(again[0].points)
        XCTAssertEqual(points[1].x, 30, accuracy: 1e-6)
        XCTAssertEqual(points[1].force, 0.75, accuracy: 1e-6)
        XCTAssertEqual(points[1].width, 4, accuracy: 1e-6)
    }

    /// PencilKit's own data reopens the drawing exactly; damaged data falls
    /// back to the strokes.
    func testPrefersPencilKitsOwnData() throws {
        let original = PKDrawing(strokes: [stroke(.marker), stroke(.pencil)])
        var sketch = try JSONDecoder().decode(StoredSketch.self, from: Data(storedJSON.utf8))
        sketch.pencilKit = StoredPencilKit(data: original.dataRepresentation().base64EncodedString(), strokes: "2:6:0")
        XCTAssertEqual(InkConversion.drawing(of: sketch), original)
        sketch.pencilKit = StoredPencilKit(data: "bm90IGEgZHJhd2luZw==", strokes: "2:6:0")
        XCTAssertEqual(InkConversion.drawing(of: sketch).strokes.count, 1)
    }
}

final class InkRequestTests: XCTestCase {
    func testRefusesWhatIsNotASketch() {
        XCTAssertNil(InkRequest(json: "{}"))
        XCTAssertNil(InkRequest(json: "not json"))
        XCTAssertNil(InkRequest(json: storedJSON.replacingOccurrences(of: "\"width\":720", with: "\"width\":0")))
        XCTAssertNotNil(InkRequest(json: storedJSON))
    }

    /// Done hands back the page's size and the strokes now on it, in the
    /// file's own fields; TypeScript adds PencilKit's fingerprint.
    func testHandsBackTheDrawingAsTheFileStoresIt() throws {
        let request = try XCTUnwrap(InkRequest(json: storedJSON))
        let drawing = PKDrawing(strokes: [stroke(), stroke()])
        let drawn = request.drawn(.init(drawing: drawing, size: CGSize(width: 720, height: 640)))
        XCTAssertEqual(drawn.height, 640)
        XCTAssertEqual(drawn.paper, request.sketch.paper)
        XCTAssertEqual(drawn.fields, PortablePoint.fields)
        XCTAssertEqual(drawn.strokes.count, 2)
        XCTAssertNil(drawn.pencilKit)
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(drawn)) as? [String: Any]
        XCTAssertEqual(json?["format"] as? String, "lumiere-sketch")
        XCTAssertEqual(json?["version"] as? Int, 1)
    }
}

final class PaperTests: XCTestCase {
    /// As paper.ts draws it: every multiple of the spacing strictly inside.
    func testMarksEveryMultipleOfTheSpacingInsideThePage() {
        XCTAssertEqual(PaperMarks.offsets(spacing: 32, length: 128), [32, 64, 96])
        XCTAssertEqual(PaperMarks.offsets(spacing: 32, length: 129), [32, 64, 96, 128])
        XCTAssertEqual(PaperMarks.offsets(spacing: 32, length: 20), [])
        XCTAssertEqual(PaperMarks.offsets(spacing: 0, length: 100), [], "a damaged spacing draws none")
    }

    func testDrawsEachPaperWithoutFailing() {
        let size = CGSize(width: 96, height: 64)
        for style in ["plain", "ruled", "grid", "dotted", "unknown"] {
            let image = UIGraphicsImageRenderer(size: size).image { context in
                PaperMarks(paper: StoredPaper(style: style, spacing: 16, color: "#ffffff"), size: size)
                    .draw(in: context.cgContext)
            }
            XCTAssertEqual(image.size, size, style)
        }
    }
}

final class CanvasTests: XCTestCase {
    /// The page grows to hold strokes drawn below it, and never shrinks.
    func testThePageGrowsToHoldTheDrawing() {
        XCTAssertEqual(SketchCanvasController.pageHeight(holding: .null, current: 480), 480)
        XCTAssertEqual(SketchCanvasController.pageHeight(holding: CGRect(x: 0, y: 0, width: 10, height: 300), current: 480), 480)
        XCTAssertEqual(
            SketchCanvasController.pageHeight(holding: CGRect(x: 0, y: 400, width: 10, height: 120.5), current: 480),
            553)
    }
}

final class EditMenuTests: XCTestCase {
    func testOffersMoreAndInsertSketch() {
        var chosen: [String] = []
        let actions = EditMenu.actions(more: { chosen.append("more") }, insertSketch: { chosen.append("sketch") })
        XCTAssertEqual(actions.map(\.title), ["More…", "Insert Sketch"])
        XCTAssertEqual(WindowCommandsPlugin.insertSketch, "insert-sketch")
    }
}
