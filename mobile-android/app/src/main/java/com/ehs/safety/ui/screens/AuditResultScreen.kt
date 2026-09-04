package com.ehs.safety.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun AuditResultScreen(isCompliant: Boolean = false) {
    val bgColor = if (isCompliant) Color(0xFFE8F5E9) else Color(0xFFFFEBEE)
    val contentColor = if (isCompliant) Color(0xFF2E7D32) else Color(0xFFC62828)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(bgColor)
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.Warning, // In real app, toggle based on isCompliant
            contentDescription = "Status Icon",
            tint = contentColor,
            modifier = Modifier.size(120.dp)
        )
        Spacer(modifier = Modifier.height(24.dp))
        Text(
            text = if (isCompliant) "COMPLIANT" else "CRITICAL VIOLATION",
            style = MaterialTheme.typography.headlineLarge.copy(fontWeight = FontWeight.Black),
            color = contentColor
        )
        
        if (!isCompliant) {
            Spacer(modifier = Modifier.height(16.dp))
            Card(
                colors = CardDefaults.cardColors(containerColor = Color.Red),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = "PERMIT SUSPENDED",
                    color = Color.White,
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    modifier = Modifier.padding(16.dp).align(Alignment.CenterHorizontally)
                )
            }
            Spacer(modifier = Modifier.height(24.dp))
            Text("Gemini AI detected:", style = MaterialTheme.typography.bodyLarge)
            Spacer(modifier = Modifier.height(8.dp))
            // Infraction lists
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("• PPE: Hard hat missing chin strap", color = Color.Red)
                    Text("• UNSAFE_ACTION: Lanyard not attached", color = Color.Red)
                }
            }
        }
    }
}
