import SwiftUI

@MainActor
final class TaskDashboardViewModel: ObservableObject {
    @Published var tasks: [AgentTask] = []
    @Published var errorMessage: String?
    @Published var isSubmitting = false

    func refresh() async {
        do {
            tasks = try await APIClient.shared.fetchTasks()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func submit(type: TaskType, prompt: String) async {
        guard !prompt.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        isSubmitting = true
        do {
            let task = try await APIClient.shared.submitTask(type: type, prompt: prompt)
            tasks.insert(task, at: 0)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
        isSubmitting = false
    }
}

struct TaskDashboardView: View {
    @StateObject private var viewModel = TaskDashboardViewModel()
    @State private var showingNewTask = false

    var body: some View {
        NavigationStack {
            List {
                if let error = viewModel.errorMessage {
                    Text(error).foregroundStyle(.red)
                }
                ForEach(viewModel.tasks) { task in
                    TaskRow(task: task)
                }
            }
            .refreshable { await viewModel.refresh() }
            .navigationTitle("Agent Pool")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showingNewTask = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingNewTask) {
                NewTaskSheet { type, prompt in
                    Task {
                        await viewModel.submit(type: type, prompt: prompt)
                        showingNewTask = false
                    }
                }
            }
            .task { await viewModel.refresh() }
        }
    }
}

private struct TaskRow: View {
    let task: AgentTask

    var statusColor: Color {
        switch task.status {
        case .queued: return .gray
        case .inProgress: return .orange
        case .completed: return .green
        case .failed: return .red
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(task.type.label).font(.headline)
                Spacer()
                Text(task.status.rawValue)
                    .font(.caption)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(statusColor.opacity(0.2))
                    .foregroundStyle(statusColor)
                    .clipShape(Capsule())
            }
            Text(task.prompt)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(2)
            if let result = task.result {
                Text(result)
                    .font(.callout)
                    .lineLimit(4)
            }
            if let error = task.error {
                Text(error).font(.callout).foregroundStyle(.red)
            }
        }
        .padding(.vertical, 4)
    }
}

private struct NewTaskSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var type: TaskType = .cryptoResearch
    @State private var prompt = ""
    let onSubmit: (TaskType, String) -> Void

    var body: some View {
        NavigationStack {
            Form {
                Picker("Type", selection: $type) {
                    ForEach(TaskType.allCases) { type in
                        Text(type.label).tag(type)
                    }
                }
                TextField("What should the agent do?", text: $prompt, axis: .vertical)
                    .lineLimit(4...8)
            }
            .navigationTitle("New Task")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Submit") { onSubmit(type, prompt) }
                        .disabled(prompt.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}
