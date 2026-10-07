package pl.okstudy.mobile;

import java.util.*;
import org.json.*;

/** Collects answer text across SSE events; nothing is returned before terminal success. */
final class ResponsesStream {
  private final TreeMap<Integer, Message> messages = new TreeMap<>();
  private final Map<String, Integer> events = new LinkedHashMap<>();
  private JSONObject completion;
  private String outcome = "nieukończona";
  private int frames;

  private static final class Part {
    final StringBuilder delta = new StringBuilder();
    String finalText;
    String kind = "output_text";
    boolean refusal;

    String text() {
      return finalText == null ? delta.toString() : finalText;
    }
  }

  private static final class Message {
    final TreeMap<Integer, Part> parts = new TreeMap<>();
    String id = "", type = "message", role = "assistant", channel = "";
    boolean incomplete;

    boolean visible() {
      return type.equals("message")
          && role.equals("assistant")
          && (channel.isEmpty() || channel.equals("final"));
    }
  }

  String read(String stream, boolean only) throws Exception {
    try {
      String normalized = stream.replace("\r\n", "\n").replace('\r', '\n');
      if (normalized.startsWith("\uFEFF")) normalized = normalized.substring(1);
      for (String block : normalized.split("\n\n+")) {
        StringBuilder data = new StringBuilder();
        String eventName = "";
        for (String line : block.split("\n")) {
          if (line.startsWith("event:")) eventName = line.substring(6).trim();
          if (line.startsWith("data:")) {
            if (data.length() > 0) data.append('\n');
            String value = line.substring(5);
            data.append(value.startsWith(" ") ? value.substring(1) : value);
          }
        }
        if (data.length() == 0 || data.toString().trim().equals("[DONE]")) continue;
        JSONObject event = new JSONObject(data.toString());
        String type = event.optString("type", eventName);
        frames++;
        String safeType =
            switch (type) {
              case "response.created",
                  "response.in_progress",
                  "response.completed",
                  "response.failed",
                  "response.incomplete",
                  "error",
                  "response.output_item.added",
                  "response.output_item.done",
                  "response.content_part.added",
                  "response.content_part.done",
                  "response.output_text.delta",
                  "response.output_text.done",
                  "response.refusal.delta",
                  "response.refusal.done" ->
                  type;
              default ->
                  type.matches("response\\.[a-z_]{1,40}(?:\\.[a-z_]{1,40}){0,5}")
                          && events.size() < 64
                      ? type + " (pominięte)"
                      : "inne (pominięte)";
            };
        events.merge(safeType, 1, Integer::sum);
        switch (type) {
          case "response.failed", "response.incomplete", "error" ->
              throw PlanHttp.failure(event.toString(), 0);
          case "response.output_text.delta" -> {
            Part part = part(event);
            String delta = text(event, "delta");
            if (part.delta.length() + delta.length() > 1_000_000) throw tooLarge();
            part.delta.append(delta);
          }
          case "response.output_text.done" -> finishPart(part(event), text(event, "text"));
          case "response.refusal.delta", "response.refusal.done" -> part(event).refusal = true;
          case "response.content_part.added", "response.content_part.done" -> {
            JSONObject content = event.optJSONObject("part");
            if (content != null) acceptPart(part(event), content, type.endsWith(".done"));
          }
          case "response.output_item.added", "response.output_item.done" -> {
            JSONObject item = event.optJSONObject("item");
            if (item != null)
              acceptItem(index(event, "output_index"), item, type.endsWith(".done"));
          }
          case "response.completed" -> {
            if (completion != null)
              throw new Exception("Niejednoznaczne zakończenie odpowiedzi ChatGPT.");
            completion = event.getJSONObject("response");
            if (completion.has("error") && !completion.isNull("error"))
              throw PlanHttp.failure(completion.toString(), 0);
            if (!completion.optString("status", "completed").equals("completed"))
              throw new Exception("ChatGPT nie potwierdził ukończenia odpowiedzi.");
            JSONArray output = completion.optJSONArray("output");
            if (output != null)
              for (int i = 0; i < output.length(); i++)
                acceptItem(i, output.getJSONObject(i), true);
          }
          default -> {
            /* Reasoning, tool arguments and unknown content are never answer text. */
          }
        }
      }
      if (completion == null)
        throw new Exception(
            "Połączenie zakończyło się przed pełną odpowiedzią ChatGPT. Spróbuj ponownie.");
      StringJoiner answer = new StringJoiner("\n");
      for (Message message : messages.values()) {
        if (!message.visible()) continue;
        if (message.incomplete) throw new Exception("ChatGPT pozostawił nieukończoną wiadomość.");
        for (Part part : message.parts.values()) {
          if (part.refusal) throw new Exception("Model odmówił odpowiedzi na to zadanie.");
          if (!part.kind.equals("output_text")) continue;
          if (!part.text().isEmpty()) answer.add(part.text());
        }
      }
      String result = ApiClient.cleanAnswer(answer.toString(), only);
      if (result.isEmpty())
        throw new Exception(
            "ChatGPT zakończył analizę bez tekstu odpowiedzi. Otwórz Diagnostykę ChatGPT w"
                + " Połączeniach i skopiuj raport.");
      outcome = "ukończona, odebrano tekst";
      return result;
    } catch (Exception e) {
      outcome = "błąd / brak pełnego wyniku";
      throw e;
    }
  }

  private Message message(int index) throws Exception {
    if (index < 0 || index > 1023 || messages.size() >= 1024 && !messages.containsKey(index))
      throw tooLarge();
    return messages.computeIfAbsent(index, ignored -> new Message());
  }

  private Part part(JSONObject event) throws Exception {
    Message message = message(index(event, "output_index"));
    identify(message, event.optString("item_id"));
    if (event.has("channel")) message.channel = event.optString("channel");
    if (event.has("role")) message.role = event.optString("role");
    return message.parts.computeIfAbsent(index(event, "content_index"), ignored -> new Part());
  }

  private static int index(JSONObject event, String key) throws Exception {
    int value = event.optInt(key, 0);
    if (value < 0 || value > 1023) throw tooLarge();
    return value;
  }

  private static void identify(Message message, String id) throws Exception {
    if (id.isEmpty()) return;
    if (!message.id.isEmpty() && !message.id.equals(id))
      throw new Exception("ChatGPT zwrócił niespójne fragmenty odpowiedzi. Spróbuj ponownie.");
    message.id = id;
  }

  private void acceptItem(int index, JSONObject item, boolean done) throws Exception {
    Message message = message(index);
    identify(message, item.optString("id"));
    message.type = item.optString("type", message.type);
    message.role = item.optString("role", message.role);
    message.channel = item.optString("channel", message.channel);
    if (done
        && (item.optString("status").equals("incomplete")
            || item.optString("status").equals("failed"))) message.incomplete = true;
    if (!message.type.equals("message")) return;
    JSONArray content = item.optJSONArray("content");
    if (content == null) return;
    if (content.length() > 1024) throw tooLarge();
    for (int i = 0; i < content.length(); i++)
      acceptPart(
          message.parts.computeIfAbsent(i, ignored -> new Part()), content.getJSONObject(i), done);
  }

  private static void acceptPart(Part part, JSONObject content, boolean done) throws Exception {
    part.kind = content.optString("type", part.kind);
    if (content.optString("type").equals("refusal")) part.refusal = true;
    if (content.optString("type").equals("output_text") && done && content.has("text"))
      finishPart(part, text(content, "text"));
  }

  private static void finishPart(Part part, String text) {
    // Some terminal snapshots omit the repeated text. Keep text collected from earlier events.
    if (!text.isEmpty()) part.finalText = text;
  }

  private static String text(JSONObject value, String field) throws Exception {
    if (value.isNull(field)) return "";
    Object raw = value.get(field);
    if (!(raw instanceof String))
      throw new Exception("ChatGPT zwrócił nieprawidłowy format tekstu odpowiedzi.");
    String text = (String) raw;
    if (text.length() > 1_000_000) throw tooLarge();
    return text;
  }

  private static Exception tooLarge() {
    return new Exception(
        "Strumień odpowiedzi ChatGPT jest zbyt duży lub ma nieprawidłowe indeksy.");
  }

  String describe() {
    int answerChars = 0, refusals = 0, reasoning = 0, other = 0, visible = 0;
    Map<String, Integer> itemTypes = new TreeMap<>(), partTypes = new TreeMap<>();
    for (Message message : messages.values()) {
      itemTypes.merge(kind(message.type), 1, Integer::sum);
      for (Part part : message.parts.values()) partTypes.merge(kind(part.kind), 1, Integer::sum);
      if (message.type.equals("reasoning")) reasoning++;
      if (!message.visible()) {
        other++;
        continue;
      }
      visible++;
      for (Part part : message.parts.values()) {
        if (part.kind.equals("output_text")) answerChars += part.text().length();
        if (part.refusal) refusals++;
      }
    }
    StringBuilder report =
        new StringBuilder("Wynik odbioru: ")
            .append(outcome)
            .append("\nresponse.completed: ")
            .append(completion != null)
            .append("\nZdarzenia: ")
            .append(frames)
            .append("\nWiadomości odpowiedzi: ")
            .append(visible)
            .append("\nZnaki tekstu: ")
            .append(answerChars)
            .append("\nOdmowy: ")
            .append(refusals)
            .append("\nElementy reasoning: ")
            .append(reasoning)
            .append("\nPominięte elementy: ")
            .append(other);
    report
        .append("\nTypy elementów: ")
        .append(itemTypes)
        .append("\nTypy części: ")
        .append(partTypes);
    if (completion != null && ApiClient.validModel(completion.optString("model")))
      report.append("\nModel zwrócony: ").append(completion.optString("model"));
    for (var entry : events.entrySet())
      report.append("\n").append(entry.getKey()).append(": ").append(entry.getValue());
    return report.toString();
  }

  private static String kind(String value) {
    return value.matches("[a-z_]{1,40}") ? value : "inny";
  }
}
