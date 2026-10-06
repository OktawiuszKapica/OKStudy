import SwiftUI

@MainActor final class Study: ObservableObject {
    @Published var image: Data?
    @Published var answer = ""
    @Published var status = "Wybierz zrzut zadania. Obraz zostanie wysłany dopiero po dotknięciu Analizuj."
    @Published var busy = false
    private var task: Task<Void, Never>?
    private var generation = 0
    func analyze() {
        if busy { stop(); return }
        guard let image else { return }
        generation += 1; let current = generation
        busy = true; status = "Analizuję zadanie…"
        task = Task {
            do {
                let provider = Store.provider, model = Store.model(provider), key = try Store.key(provider), only = Store.only
                let result = try await API.analyze(image, provider: provider, model: model, key: key, only: only)
                try Task.checkCancellation()
                guard current == generation else { return }
                answer = result; self.image = nil; status = "Odpowiedź gotowa."; busy = false; task = nil
            } catch {
                guard current == generation else { return }
                busy = false; task = nil
                status = error is CancellationError ? "Przerwano analizę." : error.localizedDescription
            }
        }
    }
    func stop() { generation += 1; task?.cancel(); task = nil; busy = false; status = "Przerwano analizę." }
    func clear() { stop(); image = nil; answer = ""; status = "Wyczyszczono zrzut i odpowiedź." }
}

enum Theme {
    static let background = Color(red: 0.071, green: 0.09, blue: 0.086)
    static let card = Color(red: 0.11, green: 0.145, blue: 0.13)
    static let lime = Color(red: 0.737, green: 0.953, blue: 0.353)
}

struct Brand: View {
    var body: some View {
        HStack(spacing: 12) {
            Canvas { context, size in
                context.scaleBy(x: size.width / 112, y: size.height / 72)
                var mark = Path()
                mark.move(to: CGPoint(x: 61,y: 21)); mark.addLine(to: CGPoint(x: 61,y: 18))
                mark.addQuadCurve(to: CGPoint(x: 51,y: 8), control: CGPoint(x: 61,y: 8))
                mark.addLine(to: CGPoint(x: 20,y: 8)); mark.addQuadCurve(to: CGPoint(x: 8,y: 20), control: CGPoint(x: 8,y: 8))
                mark.addLine(to: CGPoint(x: 8,y: 52)); mark.addQuadCurve(to: CGPoint(x: 20,y: 64), control: CGPoint(x: 8,y: 64))
                mark.addLine(to: CGPoint(x: 51,y: 64)); mark.addQuadCurve(to: CGPoint(x: 61,y: 54), control: CGPoint(x: 61,y: 64))
                mark.addLine(to: CGPoint(x: 61,y: 51)); mark.move(to: CGPoint(x: 61,y: 45)); mark.addLine(to: CGPoint(x: 99,y: 8))
                mark.move(to: CGPoint(x: 75,y: 31)); mark.addLine(to: CGPoint(x: 103,y: 64))
                context.stroke(mark, with: .color(Theme.lime), style: StrokeStyle(lineWidth: 12, lineCap: .square, lineJoin: .round))
            }.frame(width: 43, height: 28).accessibilityHidden(true)
            Text("OKStudy").font(.system(size: 26, weight: .bold, design: .rounded))
        }
    }
}

struct StudyButton: ButtonStyle {
    var prominent = true
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.system(size: 16, weight: .semibold)).frame(maxWidth: .infinity).padding(16)
            .foregroundStyle(prominent ? Theme.background : Color.white)
            .background(prominent ? Theme.lime : Theme.card, in: RoundedRectangle(cornerRadius: 16))
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}
