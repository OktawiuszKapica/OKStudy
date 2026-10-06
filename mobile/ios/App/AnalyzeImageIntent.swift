import AppIntents
import Foundation

/// Shortcuts: Take Screenshot → Analyze image with OKStudy → Show Result / Speak Text.
/// The user selects this action explicitly; no unattended screen reading.
struct AnalyzeImageIntent: AppIntent {
    static var title: LocalizedStringResource = "Analizuj obraz w OKStudy"
    static var description = IntentDescription("Wysyła przekazany zrzut do wybranego AI i zwraca odpowiedź. Wymaga konfiguracji API w OKStudy.")
    static var openAppWhenRun = false
    @Parameter(title: "Obraz") var image: IntentFile
    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        let provider = Store.provider, model = Store.model(provider), key = try Store.key(provider)
        let data = image.data
        let jpeg = try await Task.detached { try ImageCodec.jpeg(data) }.value
        try Task.checkCancellation()
        let answer = try await API.analyze(jpeg, provider: provider, model: model, key: key, only: Store.only)
        return .result(value: answer)
    }
}
