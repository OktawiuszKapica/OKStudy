import SwiftUI
import PhotosUI

struct HomeView: View {
    @StateObject private var study = Study()
    @StateObject private var speaker = Speaker()
    @State private var selection: PhotosPickerItem?
    @State private var settings = false
    @State private var loading: Task<Void, Never>?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                HStack { Brand(); Spacer(); Button { settings = true } label: { Image(systemName: "slider.horizontal.3").padding(12) }.accessibilityLabel("Ustawienia") }
                Text("TWOJA POMOC W NAUCE · MOBILE").font(.caption2.weight(.bold)).tracking(2).foregroundStyle(Theme.lime)
                Text("Zadanie na ekranie.\nOdpowiedź pod ręką.").font(.system(size: 34, weight: .bold, design: .rounded))
                Text("Zrób zrzut zadania i udostępnij go do OKStudy. Możesz też wybrać obraz ze zdjęć.").foregroundStyle(.secondary)
                PhotosPicker(selection: $selection, matching: .images) { Label("Wybierz zrzut zadania", systemImage: "photo") }.buttonStyle(StudyButton())
                if let data = study.image, let image = UIImage(data: data) {
                    Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 250).clipShape(RoundedRectangle(cornerRadius: 16))
                    Button(study.busy ? "Przerwij analizę" : "Analizuj zrzut") { speaker.stop(); study.analyze() }.buttonStyle(StudyButton())
                }
                Text(study.status).font(.callout).foregroundStyle(.secondary).accessibilityAddTraits(.updatesFrequently)
                if !study.answer.isEmpty {
                    VStack(alignment: .leading, spacing: 16) {
                        Text("ODPOWIEDŹ").font(.caption.weight(.semibold)).foregroundStyle(Theme.lime)
                        Text(study.answer).font(.title3).textSelection(.enabled)
                        HStack {
                            ShareLink(item: study.answer) { Label("Udostępnij", systemImage: "square.and.arrow.up") }
                            Spacer()
                            Button(speaker.busy ? "Zatrzymaj głos" : "Przeczytaj") { speaker.read(study.answer) }
                        }.font(.callout)
                        if !speaker.error.isEmpty { Text(speaker.error).font(.caption).foregroundStyle(.orange) }
                        Button("Wyczyść") { speaker.stop(); study.clear() }.font(.caption)
                    }.padding(22).background(Theme.card, in: RoundedRectangle(cornerRadius: 22))
                }
                Text("Zrzut pozostaje w pamięci na czas zadania. Korzystanie z AI i głosu OpenAI jest rozliczane przez API, poza abonamentem ChatGPT.").font(.caption).foregroundStyle(.secondary)
                Text("OKStudy Mobile 0.1.0 · wersja testowa\nOktawiusz Kapica").font(.caption2).foregroundStyle(.secondary)
            }.padding(24).frame(maxWidth: 660).frame(maxWidth: .infinity)
        }.background(Theme.background).tint(Theme.lime)
            .sheet(isPresented: $settings) { SettingsView() }
            .onChange(of: selection) { _, item in
                loading?.cancel(); study.stop(); study.image = nil; study.status = "Przygotowuję zrzut…"
                loading = Task {
                    do {
                        guard let data = try await item?.loadTransferable(type: Data.self) else { return }
                        let jpeg = try await Task.detached { try ImageCodec.jpeg(data) }.value
                        try Task.checkCancellation(); study.image = jpeg; study.status = "Zrzut gotowy. Dotknij Analizuj, aby wysłać go do AI."
                    } catch { if !Task.isCancelled { study.status = error.localizedDescription } }
                }
            }
    }
}
