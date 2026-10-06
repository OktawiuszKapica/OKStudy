import Foundation
import Combine
import AVFoundation

@MainActor final class Speaker: NSObject, ObservableObject, AVSpeechSynthesizerDelegate, AVAudioPlayerDelegate {
    @Published var busy = false
    @Published var error = ""
    private let synth = AVSpeechSynthesizer()
    private var player: AVAudioPlayer?
    private var task: Task<Void, Never>?
    private var generation = 0
    override init() { super.init(); synth.delegate = self }
    func read(_ text: String) {
        if busy { stop(); return }
        guard !text.isEmpty else { return }
        stop(); error = ""; busy = true
        let current = generation, input = String(text.prefix(4000))
        if Store.defaults.string(forKey: "voice") != "openai" {
            let speech = AVSpeechUtterance(string: input)
            guard let voice = AVSpeechSynthesisVoice(language: "pl-PL") else { busy = false; error = "Zainstaluj polski głos w ustawieniach urządzenia."; return }
            speech.voice = voice; speech.rate = AVSpeechUtteranceDefaultSpeechRate; synth.speak(speech); return
        }
        task = Task {
            do {
                let key = try Store.key("openai")
                guard !key.isEmpty else { throw StudyError("Głos OpenAI wymaga osobnego klucza API OpenAI.") }
                let data = try await API.request("https://api.openai.com/v1/audio/speech", provider: "openai", key: key,
                    body: ["model": "gpt-4o-mini-tts", "voice": "marin", "input": input, "response_format": "mp3", "instructions": "Czytaj naturalnie po polsku, spokojnie i wyraźnie, bez wstępu."])
                try Task.checkCancellation(); guard current == generation else { return }
                let audio = try AVAudioPlayer(data: data); player = audio; audio.delegate = self
                guard audio.play() else { throw StudyError("Nie udało się odtworzyć nagrania.") }
                task = nil
            } catch {
                guard current == generation else { return }
                busy = false; task = nil
                if !(error is CancellationError) { self.error = error.localizedDescription }
            }
        }
    }
    func stop() { generation += 1; task?.cancel(); task = nil; synth.stopSpeaking(at: .immediate); player?.stop(); player = nil; busy = false }
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) { Task { @MainActor in if !self.synth.isSpeaking { self.busy = false } } }
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) { Task { @MainActor in if self.player === player { self.busy = false; self.player = nil } } }
    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) { Task { @MainActor in if self.player === player { self.stop(); self.error = "Nie udało się odtworzyć głosu." } } }
}
