import UIKit
import SwiftUI
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    private let study = Study()
    private let speaker = Speaker()
    private var loading: Task<Void, Never>?
    override func viewDidLoad() {
        super.viewDidLoad()
        let host = UIHostingController(rootView: ShareView(study: study, speaker: speaker, close: { [weak self] in self?.finish() }))
        addChild(host); host.view.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(host.view)
        NSLayoutConstraint.activate([host.view.topAnchor.constraint(equalTo: view.topAnchor), host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor), host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor)])
        host.didMove(toParent: self)
        let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
        guard let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.image.identifier) }) else {
            study.status = "Udostępnij jeden obraz lub zrzut ekranu."; return
        }
        study.status = "Przygotowuję udostępniony zrzut…"
        loading = Task {
            do {
                let data: Data = try await withCheckedThrowingContinuation { continuation in
                    provider.loadFileRepresentation(forTypeIdentifier: UTType.image.identifier) { url, error in
                        do {
                            if let error { throw error }
                            guard let url else { throw StudyError("Nie można odczytać udostępnionego pliku.") }
                            // Decode within the callback while the temporary URL is valid.
                            continuation.resume(returning: try ImageCodec.jpeg(url: url))
                        } catch { continuation.resume(throwing: error) }
                    }
                }
                try Task.checkCancellation(); study.image = data
                study.status = "Dotknij Analizuj, aby wysłać ten zrzut do wybranego AI."
            } catch { if !Task.isCancelled { study.status = error.localizedDescription } }
        }
    }
    private func finish() { loading?.cancel(); study.clear(); speaker.stop(); extensionContext?.completeRequest(returningItems: nil) }
    override func viewDidDisappear(_ animated: Bool) { super.viewDidDisappear(animated); loading?.cancel(); study.stop(); speaker.stop() }
}

private struct ShareView: View {
    @ObservedObject var study: Study
    @ObservedObject var speaker: Speaker
    let close: () -> Void
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack { Brand(); Spacer(); Button("Gotowe", action: close) }
                Text("Odpowiedź pod ręką.").font(.title.bold())
                if let data = study.image, let image = UIImage(data: data) {
                    Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 210).clipShape(RoundedRectangle(cornerRadius: 16))
                    Button(study.busy ? "Przerwij analizę" : "Analizuj zrzut") { study.analyze() }.buttonStyle(StudyButton())
                }
                Text(study.status).foregroundStyle(.secondary).font(.callout)
                if !study.answer.isEmpty {
                    Text(study.answer).font(.title2).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading).padding(20).background(Theme.card, in: RoundedRectangle(cornerRadius: 20))
                    Button(speaker.busy ? "Zatrzymaj głos" : "Przeczytaj odpowiedź") { speaker.read(study.answer) }.buttonStyle(StudyButton(prominent: false))
                    if !speaker.error.isEmpty { Text(speaker.error).foregroundStyle(.orange).font(.caption) }
                }
                Text("Klucz API, model i głos ustawisz w aplikacji OKStudy. Abonament ChatGPT nie pokrywa opłat API.").foregroundStyle(.secondary).font(.caption)
            }.padding(24)
        }.background(Theme.background).tint(Theme.lime).preferredColorScheme(.dark)
    }
}
