import SwiftUI

@MainActor
final class SchedulesViewModel: ObservableObject {
    @Published var schedules: [TaskSchedule] = []
    @Published var errorMessage: String?

    func refresh() async {
        do {
            schedules = try await APIClient.shared.fetchSchedules()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func create(type: TaskType, prompt: String, intervalMinutes: Int) async {
        do {
            let schedule = try await APIClient.shared.createSchedule(type: type, prompt: prompt, intervalMinutes: intervalMinutes)
            schedules.append(schedule)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func cancel(_ schedule: TaskSchedule) async {
        do {
            try await APIClient.shared.cancelSchedule(id: schedule.id)
            schedules.removeAll { $0.id == schedule.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct SchedulesView: View {
    @StateObject private var viewModel = SchedulesViewModel()
    @State private var showingNewSchedule = false

    var body: some View {
        NavigationStack {
            List {
                if let error = viewModel.errorMessage {
                    Text(error).foregroundStyle(.red)
                }
                if viewModel.schedules.isEmpty {
                    Text("No recurring research set up yet.")
                        .foregroundStyle(.secondary)
                }
                ForEach(viewModel.schedules) { schedule in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(schedule.type.label).font(.headline)
                        Text(schedule.prompt).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                        Text("Every \(schedule.intervalMinutes) min · next run \(schedule.nextRunAt)")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                    .swipeActions {
                        Button("Cancel", role: .destructive) {
                            Task { await viewModel.cancel(schedule) }
                        }
                    }
                }
            }
            .refreshable { await viewModel.refresh() }
            .navigationTitle("Schedules")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showingNewSchedule = true } label: { Image(systemName: "plus") }
                }
            }
            .sheet(isPresented: $showingNewSchedule) {
                NewScheduleSheet { type, prompt, minutes in
                    Task {
                        await viewModel.create(type: type, prompt: prompt, intervalMinutes: minutes)
                        showingNewSchedule = false
                    }
                }
            }
            .task { await viewModel.refresh() }
        }
    }
}

private struct NewScheduleSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var type: TaskType = .cryptoResearch
    @State private var prompt = ""
    @State private var intervalMinutes = 60
    let onCreate: (TaskType, String, Int) -> Void

    var body: some View {
        NavigationStack {
            Form {
                Picker("Type", selection: $type) {
                    ForEach(TaskType.allCases) { type in
                        Text(type.label).tag(type)
                    }
                }
                TextField("What should it research, every time?", text: $prompt, axis: .vertical)
                    .lineLimit(3...6)
                Stepper("Every \(intervalMinutes) min", value: $intervalMinutes, in: 5...1440, step: 5)
            }
            .navigationTitle("New Schedule")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") { onCreate(type, prompt, intervalMinutes) }
                        .disabled(prompt.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}
