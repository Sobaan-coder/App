# Flutter & plugins ship their own consumer rules; keep these for reflection-based libraries.
-keep class io.flutter.plugins.** { *; }
-keep class com.google.mlkit.** { *; }
-dontwarn com.google.android.play.core.**
-dontwarn com.google.errorprone.annotations.**
