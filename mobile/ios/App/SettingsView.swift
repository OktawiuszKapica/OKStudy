import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var provider = Store.provider
    @State private var model = Store.model(Store.provider)
    @State private var key = ""
    @State private var only = Store.only
    @State private var voice = Store.defaults.string(forKey: "voice") ?? "system"
    @State private var message = "Puste pole klucza zachowuje zapisany klucz."
    @State private var models: [API.Model] = []
    @State private var showModels = false
    @State private var loading = false
    @State private var task: Task<Void, Never>?
    var body: some View {
        NavigationStack {
            Form {
                Section("Twoje AI") {
                    Picker("Dostawca", selection: $provider) { ForEach(Array(API.providers.enumerated()), id: \.element) { i, id in Text(API.names[i]).tag(id) } }
                    SecureField("Klucz API", text: $key).textInputAutocapitalization(.never).autocorrectionDisabled()
                    TextField("Identyfikator modelu", text: $model).textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button(loading ? "Pobieram modele…" : "Pobierz modele konta") { loadModels() }.disabled(loading)
                    Toggle("Tylko odpowiedź: D albo samo hasło", isOn: $only)
                }
                Section("Głos") {
                    Picker("Źródło", selection: $voice) { Text("Polski głos systemowy").tag("system"); Text("OpenAI Marin · płatne API").tag("openai") }
                    Text("Głos OpenAI wymaga zapisanego klucza OpenAI. Każde naciśnięcie Przeczytaj generuje osobno płatne nagranie. Tekst trafia do OpenAI; głos jest generowany przez AI.").font(.caption)
                }
                Section {
                    Button("Zapisz ustawienia") {
                        do { try Store.save(provider: provider, model: model.trimmingCharacters(in: .whitespacesAndNewlines), key: key.trimmingCharacters(in: .whitespacesAndNewlines), only: only); Store.defaults.set(voice, forKey: "voice"); key = ""; message = "Zapisano ustawienia." }
                        catch { message = error.localizedDescription }
                    }
                    Button("Usuń klucz dostawcy", role: .destructive) { do { try Store.saveKey("", provider: provider); key = ""; message = "Usunięto klucz." } catch { message = error.localizedDescription } }
                    Text(message).font(.caption)
                    Text("Lista pochodzi z konta dostawcy. Nowy identyfikator można wpisać ręcznie. Wybrany model musi obsługiwać obrazy. API ma osobne rozliczenie względem abonamentu ChatGPT.").font(.caption).foregroundStyle(.secondary)
                }
            }.navigationTitle("Ustawienia").toolbar { ToolbarItem(placement: .confirmationAction) { Button("Gotowe") { dismiss() } } }
                .tint(Theme.lime).preferredColorScheme(.dark)
                .onChange(of: provider) { _, value in task?.cancel(); loading = false; key = ""; model = Store.model(value) }
                .onDisappear { task?.cancel() }
                .sheet(isPresented: $showModels) {
                    NavigationStack { List(models) { item in Button { model = item.id; showModels = false } label: { VStack(alignment: .leading) { Text(item.name); if item.name != item.id { Text(item.id).font(.caption).foregroundStyle(.secondary) } } } }.navigationTitle("Modele konta").toolbar { Button("Zamknij") { showModels = false } } }
                }
        }
    }
    private func loadModels() {
        task?.cancel(); let selectedProvider = provider, draft = key; loading = true
        task = Task {
            do {
                let token = draft.isEmpty ? try Store.key(selectedProvider) : draft
                let result = try await API.models(provider: selectedProvider, key: token)
                try Task.checkCancellation(); guard provider == selectedProvider else { return }
                models = result; loading = false
                if result.isEmpty { message = "Konto nie zwróciło modeli. Wpisz identyfikator ręcznie." } else { showModels = true }
            } catch { if !Task.isCancelled { loading = false; message = error.localizedDescription } }
        }
    }
}
