import Foundation

enum TaskType: String, CaseIterable, Identifiable, Codable {
    case cryptoResearch = "crypto-research"
    case polymarketResearch = "polymarket-research"
    case stockResearch = "stock-research"
    case commodityResearch = "commodity-research"
    case digitalProduct = "digital-product"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .cryptoResearch: return "Crypto Research"
        case .polymarketResearch: return "Polymarket Research"
        case .stockResearch: return "Stock Research"
        case .commodityResearch: return "Commodity Research"
        case .digitalProduct: return "Digital Product Draft"
        }
    }
}

enum TaskStatus: String, Codable {
    case queued
    case inProgress = "in_progress"
    case completed
    case failed
}

struct AgentTask: Codable, Identifiable {
    let id: String
    let type: TaskType
    let prompt: String
    let status: TaskStatus
    let result: String?
    let error: String?
    let createdAt: String
    let updatedAt: String
}

struct ChatMessage: Codable, Identifiable, Equatable {
    enum Role: String, Codable {
        case user
        case assistant
    }

    let id: UUID
    let role: Role
    let content: String

    init(id: UUID = UUID(), role: Role, content: String) {
        self.id = id
        self.role = role
        self.content = content
    }
}
