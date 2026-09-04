package com.ehs.safety.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VoiceReportScreen() {
    var isRecording by remember { mutableStateOf(false) }
    var transcription by remember { mutableStateOf("Tahan tombol mic untuk mulai berbicara...") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Laporan Suara (Darurat)") },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color(0xFFB91C1C), titleContentColor = Color.White)
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = if (isRecording) "Merekam Suara..." else "Siap Merekam",
                style = MaterialTheme.typography.headlineSmall,
                color = if (isRecording) Color.Red else Color.Black
            )
            
            Spacer(modifier = Modifier.height(32.dp))

            FloatingActionButton(
                onClick = { isRecording = !isRecording },
                containerColor = if (isRecording) Color.Red else Color.DarkGray,
                contentColor = Color.White,
                modifier = Modifier.size(100.dp)
            ) {
                Icon(
                    imageVector = if (isRecording) Icons.Default.Stop else Icons.Default.Mic,
                    contentDescription = "Mic",
                    modifier = Modifier.size(48.dp)
                )
            }

            Spacer(modifier = Modifier.height(48.dp))
            
            Card(
                colors = CardDefaults.cardColors(containerColor = Color(0xFFF1F5F9)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = transcription,
                    modifier = Modifier.padding(16.dp),
                    style = MaterialTheme.typography.bodyLarge
                )
            }
        }
    }
}
