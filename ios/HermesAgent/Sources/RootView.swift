import SwiftUI

struct RootView: View {
    var body: some View {
        TabView {
            ChatView()
                .tabItem { Label("Chat", systemImage: "bubble.left.and.bubble.right") }

            TaskDashboardView()
                .tabItem { Label("Agent Pool", systemImage: "square.stack.3d.up") }

            SchedulesView()
                .tabItem { Label("Schedules", systemImage: "clock.arrow.circlepath") }
        }
    }
}
