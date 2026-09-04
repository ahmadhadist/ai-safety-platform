import SwiftUI
import AVFoundation
import Combine

// MARK: - App State
class AppState: ObservableObject {
    @Published var isLoggedIn: Bool = false
    @Published var userName: String = "User"
    @Published var token: String = ""
}

// MARK: - Root Router
struct ContentView: View {
    @StateObject var appState = AppState()
    
    var body: some View {
        if appState.isLoggedIn {
            MainTabView().environmentObject(appState)
        } else {
            LoginView().environmentObject(appState)
        }
    }
}

// MARK: - Login View
struct LoginView: View {
    @EnvironmentObject var appState: AppState
    @State private var email = "admin@globalmfg.com"
    @State private var password = "admin123"
    @State private var isLoading = false
    @State private var errorMessage = ""
    
    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            
            Image(systemName: "shield.checkerboard")
                .font(.system(size: 80))
                .foregroundColor(.blue)
            
            Text("EHS Safety Platform")
                .font(.title)
                .fontWeight(.bold)
            
            VStack(alignment: .leading) {
                TextField("Email", text: $email)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
                    .autocapitalization(.none)
                
                SecureField("Password", text: $password)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
            }
            .padding(.horizontal, 30)
            
            if !errorMessage.isEmpty {
                Text(errorMessage).foregroundColor(.red).font(.caption)
            }
            
            if isLoading {
                ProgressView()
            } else {
                Button(action: login) {
                    Text("Login")
                        .fontWeight(.bold)
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue)
                        .cornerRadius(10)
                }
                .padding(.horizontal, 30)
            }
            
            Spacer()
        }
        .background(Color(UIColor.systemBackground))
    }
    
    func login() {
        isLoading = true
        errorMessage = ""
        
        guard let url = URL(string: "http://192.168.0.14:8000/api/v1/auth/login") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        let bodyString = "username=\(email)&password=\(password)"
        request.httpBody = bodyString.data(using: .utf8)
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                self.isLoading = false
                if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200,
                   let data = data,
                   let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    self.appState.token = json["access_token"] as? String ?? ""
                    self.appState.userName = json["full_name"] as? String ?? "User"
                    withAnimation { self.appState.isLoggedIn = true }
                } else {
                    self.errorMessage = "Login gagal. Periksa email & password."
                }
            }
        }.resume()
    }
}

// MARK: - Main Tab Navigation
struct MainTabView: View {
    @EnvironmentObject var appState: AppState
    
    var body: some View {
        TabView {
            HomeDashboardView()
                .tabItem {
                    Image(systemName: "house.fill")
                    Text("Home")
                }
            
            EPermitView()
                .tabItem {
                    Image(systemName: "doc.text.viewfinder")
                    Text("E-Permit")
                }
            
            VoiceReportView()
                .tabItem {
                    Image(systemName: "exclamationmark.triangle.fill")
                    Text("SOS Report")
                }
            
            FieldGuideView()
                .tabItem {
                    Image(systemName: "sparkles")
                    Text("AI Guide")
                }
        }
        .accentColor(.blue)
    }
}

// MARK: - 1. Home Dashboard View
struct HomeDashboardView: View {
    @EnvironmentObject var appState: AppState
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 20) {
                    HStack {
                        VStack(alignment: .leading) {
                            Text("Halo, \(appState.userName)")
                                .font(.title2)
                                .fontWeight(.bold)
                            Text("Field Inspector")
                                .font(.subheadline)
                                .foregroundColor(.gray)
                        }
                        Spacer()
                        Button(action: {
                            withAnimation { appState.isLoggedIn = false }
                        }) {
                            Text("Logout")
                                .font(.caption)
                                .padding(8)
                                .background(Color.red.opacity(0.1))
                                .foregroundColor(.red)
                                .cornerRadius(8)
                        }
                    }
                    .padding(.horizontal)
                    
                    VStack {
                        Text("Safety Compliance Score")
                            .font(.headline)
                            .foregroundColor(.white)
                        Text("98%")
                            .font(.system(size: 48, weight: .black))
                            .foregroundColor(.white)
                        Text("Status: AMAN")
                            .font(.subheadline)
                            .foregroundColor(.green)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 4)
                            .background(Color.white)
                            .cornerRadius(12)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
                    .background(LinearGradient(gradient: Gradient(colors: [Color.blue, Color.cyan]), startPoint: .topLeading, endPoint: .bottomTrailing))
                    .cornerRadius(20)
                    .padding(.horizontal)
                    
                    Spacer()
                }
                .padding(.top)
            }
            .navigationTitle("Dashboard")
        }
    }
}

// MARK: - 2. E-Permit View
struct Permit: Identifiable, Decodable {
    let id: String
    let permit_code: String
    let contractor_company: String
    let status: String
}

struct EPermitView: View {
    @State private var permits: [Permit] = []
    @State private var isLoading = true
    
    var body: some View {
        NavigationView {
            Group {
                if isLoading {
                    ProgressView("Mengambil data izin...")
                } else {
                    List {
                        ForEach(permits) { permit in
                            HStack {
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(permit.permit_code).font(.headline)
                                    Text(permit.contractor_company).font(.subheadline).foregroundColor(.gray)
                                }
                                Spacer()
                                Text(permit.status)
                                    .font(.caption)
                                    .fontWeight(.bold)
                                    .foregroundColor(permit.status == "APPROVED" ? .green : .blue)
                            }
                        }
                    }
                    .listStyle(InsetGroupedListStyle())
                }
            }
            .navigationTitle("Live E-Permits")
            .onAppear(perform: fetchPermits)
        }
    }
    
    func fetchPermits() {
        guard let url = URL(string: "http://192.168.0.14:8000/api/v1/permits") else { return }
        URLSession.shared.dataTask(with: url) { data, response, error in
            DispatchQueue.main.async {
                self.isLoading = false
                if let data = data {
                    do {
                        self.permits = try JSONDecoder().decode([Permit].self, from: data)
                    } catch {
                        print("Error decoding permits")
                    }
                }
            }
        }.resume()
    }
}

// MARK: - 3. Voice Report View
struct VoiceReportView: View {
    @State private var isRecording = false
    @State private var transcript = ""
    @State private var showResult = false
    @State private var hazardLevel = ""
    @State private var immediateAction = ""
    @State private var isLoading = false
    @State private var audioRecorder: AVAudioRecorder?
    @State private var recordingURL: URL?

    var body: some View {
        NavigationView {
            VStack(spacing: 30) {
                Spacer()
                ZStack {
                    Circle()
                        .fill(isRecording ? Color.red.opacity(0.2) : Color.orange.opacity(0.1))
                        .frame(width: 150, height: 150)
                        .scaleEffect(isRecording ? 1.2 : 1.0)
                        .animation(isRecording ? .easeInOut(duration: 0.8).repeatForever(autoreverses: true) : .default, value: isRecording)
                    Image(systemName: isRecording ? "waveform" : "mic.fill")
                        .font(.system(size: 60))
                        .foregroundColor(isRecording ? .red : .orange)
                }
                Text(isRecording ? "Merekam Laporan Darurat..." : "Tekan untuk Melapor Insiden")
                    .font(.headline)
                    .foregroundColor(.secondary)
                if isLoading { ProgressView("AI sedang menganalisis...") }
                if showResult {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("🚨 Hazard Level: \(hazardLevel)").foregroundColor(hazardLevel == "CRITICAL" ? .red : .orange)
                        Text(transcript).font(.body).padding().background(Color.gray.opacity(0.1)).cornerRadius(12)
                    }
                    .padding(.horizontal)
                }
                Spacer()
                Button(action: {
                    isRecording ? stopRecording() : startRecording()
                }) {
                    Text(isRecording ? "Berhenti & Kirim ke Pusat" : "Mulai Rekam Suara")
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity).padding()
                        .background(isRecording ? Color.red : Color.orange)
                        .cornerRadius(16)
                }
                .padding(.horizontal, 30).padding(.bottom, 20)
            }
            .navigationTitle("SOS Voice Report")
        }
    }
    func startRecording() {
        let audioSession = AVAudioSession.sharedInstance()
        do {
            try audioSession.setCategory(.playAndRecord, mode: .default)
            try audioSession.setActive(true)
            let path = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("report.m4a")
            recordingURL = path
            audioRecorder = try AVAudioRecorder(url: path, settings: [AVFormatIDKey: Int(kAudioFormatMPEG4AAC), AVSampleRateKey: 12000, AVNumberOfChannelsKey: 1])
            audioRecorder?.record()
            isRecording = true
            showResult = false
        } catch {}
    }
    func stopRecording() {
        audioRecorder?.stop()
        isRecording = false
        isLoading = true
        if let url = recordingURL { uploadAudio(fileURL: url) }
    }
    func uploadAudio(fileURL: URL) {
        guard let url = URL(string: "http://192.168.0.14:8000/api/v1/mobile/voice-report") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        let boundary = UUID().uuidString
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"audio\"; filename=\"report.m4a\"\r\nContent-Type: audio/m4a\r\n\r\n".data(using: .utf8)!)
        if let audioData = try? Data(contentsOf: fileURL) { body.append(audioData) }
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body
        URLSession.shared.dataTask(with: request) { data, _, _ in
            DispatchQueue.main.async {
                self.isLoading = false
                if let data = data, let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    self.transcript = json["incident_description"] as? String ?? ""
                    self.hazardLevel = json["hazard_level"] as? String ?? ""
                    self.showResult = true
                }
            }
        }.resume()
    }
}

// MARK: - 4. AI Field Guide View (Chat)
struct ChatMessage: Identifiable {
    let id = UUID()
    let text: String
    let isUser: Bool
}

struct FieldGuideView: View {
    @State private var messages: [ChatMessage] = [
        ChatMessage(text: "Halo! Saya AI Co-Pilot K3 Anda. Ada yang bisa saya bantu terkait SOP atau keamanan?", isUser: false)
    ]
    @State private var inputText = ""
    @State private var isTyping = false
    
    var body: some View {
        NavigationView {
            VStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(messages) { msg in
                            HStack {
                                if msg.isUser { Spacer() }
                                Text(LocalizedStringKey(msg.text))
                                    .padding()
                                    .background(msg.isUser ? Color.blue : Color.gray.opacity(0.2))
                                    .foregroundColor(msg.isUser ? .white : .primary)
                                    .cornerRadius(15)
                                if !msg.isUser { Spacer() }
                            }
                        }
                        if isTyping {
                            HStack {
                                Text("AI sedang mengetik...")
                                    .font(.caption)
                                    .foregroundColor(.gray)
                                Spacer()
                            }
                        }
                    }
                    .padding()
                }
                
                HStack {
                    TextField("Tanya AI Co-Pilot...", text: $inputText)
                        .padding()
                        .background(Color.gray.opacity(0.1))
                        .cornerRadius(25)
                    
                    Button(action: sendMessage) {
                        Image(systemName: "paperplane.fill")
                            .foregroundColor(.white)
                            .padding()
                            .background(Color.blue)
                            .clipShape(Circle())
                    }
                }
                .padding()
            }
            .navigationTitle("AI Field Guide")
        }
    }
    
    func sendMessage() {
        guard !inputText.isEmpty else { return }
        let userText = inputText
        messages.append(ChatMessage(text: userText, isUser: true))
        inputText = ""
        isTyping = true
        
        guard let url = URL(string: "http://192.168.0.14:8000/api/v1/mobile/field-guide") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let json: [String: Any] = ["message": userText]
        request.httpBody = try? JSONSerialization.data(withJSONObject: json)
        
        URLSession.shared.dataTask(with: request) { data, _, _ in
            DispatchQueue.main.async {
                self.isTyping = false
                if let data = data, let jsonResp = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    let reply = jsonResp["reply"] as? String ?? "Maaf, saya tidak mengerti."
                    self.messages.append(ChatMessage(text: reply, isUser: false))
                } else {
                    self.messages.append(ChatMessage(text: "Koneksi ke AI gagal (Mock Mode).", isUser: false))
                }
            }
        }.resume()
    }
}