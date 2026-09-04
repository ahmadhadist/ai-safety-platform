package com.ehs.safety.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

data class Permit(val id: String, val code: String, val contractor: String, val status: String)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ActivePermitsListScreen() {
    val mockPermits = listOf(
        Permit("1", "HW-2026-0891", "Fuji Welders Ltd", "APPROVED"),
        Permit("2", "WAH-2026-0102", "Lone Star Scaffolding", "SUSPENDED")
    )

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Active Permits") },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { /* Launch QR Scanner */ }) {
                Text("SCAN")
            }
        }
    ) { padding ->
        LazyColumn(contentPadding = padding) {
            items(mockPermits) { permit ->
                PermitCard(permit)
            }
        }
    }
}

@Composable
fun PermitCard(permit: Permit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .clickable { /* Navigate to Camera Inspection */ },
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(text = permit.code, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
            Spacer(modifier = Modifier.height(4.dp))
            Text(text = permit.contractor, style = MaterialTheme.typography.bodyMedium)
            Spacer(modifier = Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = if (permit.status == "APPROVED") Icons.Default.CheckCircle else Icons.Default.Warning,
                    contentDescription = null,
                    tint = if (permit.status == "APPROVED") Color(0xFF4CAF50) else Color(0xFFF44336),
                    modifier = Modifier.size(16.dp)
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = permit.status,
                    style = MaterialTheme.typography.labelMedium,
                    color = if (permit.status == "APPROVED") Color(0xFF4CAF50) else Color(0xFFF44336)
                )
            }
        }
    }
}
