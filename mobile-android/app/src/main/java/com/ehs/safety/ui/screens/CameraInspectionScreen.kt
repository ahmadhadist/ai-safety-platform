package com.ehs.safety.ui.screens

import android.content.Context
import android.net.Uri
import android.util.Log
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import java.io.File
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.concurrent.Executor

@Composable
fun CameraInspectionScreen(permitId: String, onImageCaptured: (Uri) -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val cameraProviderFuture = remember { ProcessCameraProvider.getInstance(context) }
    
    var imageCapture by remember { mutableStateOf<ImageCapture?>(null) }
    val executor: Executor = ContextCompat.getMainExecutor(context)

    Box(modifier = Modifier.fillMaxSize()) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                val previewView = PreviewView(ctx)
                cameraProviderFuture.addListener({
                    val cameraProvider = cameraProviderFuture.get()
                    val preview = Preview.Builder().build().also {
                        it.setSurfaceProvider(previewView.surfaceProvider)
                    }
                    imageCapture = ImageCapture.Builder().build()
                    val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

                    try {
                        cameraProvider.unbindAll()
                        cameraProvider.bindToLifecycle(
                            lifecycleOwner, cameraSelector, preview, imageCapture
                        )
                    } catch (exc: Exception) {
                        Log.e("CameraX", "Use case binding failed", exc)
                    }
                }, executor)
                previewView
            }
        )

        // Capture Button Overlay
        FloatingActionButton(
            onClick = {
                val file = File(context.cacheDir, "audit_${SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(System.currentTimeMillis())}.jpg")
                val outputOptions = ImageCapture.OutputFileOptions.Builder(file).build()

                imageCapture?.takePicture(
                    outputOptions, executor,
                    object : ImageCapture.OnImageSavedCallback {
                        override fun onImageSaved(output: ImageCapture.OutputFileResults) {
                            val savedUri = Uri.fromFile(file)
                            onImageCaptured(savedUri)
                        }
                        override fun onError(exc: ImageCaptureException) {
                            Log.e("CameraX", "Photo capture failed: ${exc.message}", exc)
                        }
                    }
                )
            },
            shape = CircleShape,
            containerColor = Color.White,
            contentColor = Color.Black,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 32.dp)
                .size(72.dp)
        ) {
            Icon(Icons.Filled.CameraAlt, contentDescription = "Capture Evidence", modifier = Modifier.size(36.dp))
        }
    }
}
