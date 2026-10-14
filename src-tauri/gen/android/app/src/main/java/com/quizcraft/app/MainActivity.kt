package com.quizcraft.app

import android.os.Bundle
import android.view.MotionEvent
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  private var blockingPinch = false
  private var appWebView: WebView? = null
  override val handleBackNavigation: Boolean = false

  override fun dispatchTouchEvent(event: MotionEvent): Boolean {
    if (event.actionMasked == MotionEvent.ACTION_DOWN) blockingPinch = false
    if (event.pointerCount > 1 || blockingPinch) {
      if (!blockingPinch) {
        // Cancel the first finger's gesture so a pinch cannot become a tap or swipe.
        val cancel = MotionEvent.obtain(event)
        cancel.action = MotionEvent.ACTION_CANCEL
        super.dispatchTouchEvent(cancel)
        cancel.recycle()
      }
      blockingPinch = event.actionMasked != MotionEvent.ACTION_UP &&
        event.actionMasked != MotionEvent.ACTION_CANCEL
      return true
    }
    return super.dispatchTouchEvent(event)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    appWebView = webView
    webView.isVerticalScrollBarEnabled = false
    webView.isHorizontalScrollBarEnabled = false
    webView.settings.setSupportZoom(false)
    webView.settings.builtInZoomControls = false
    webView.settings.displayZoomControls = false
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        appWebView?.evaluateJavascript(
          "window.dispatchEvent(new Event('quizcraft-back'));", null
        )
      }
    })
  }
}
