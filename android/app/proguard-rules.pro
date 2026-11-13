# Add project specific ProGuard rules here.

# Capacitor core and plugin annotations
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod public *;
}

# Keep Tazkeer adhan engine classes and fields
-keep class com.abdelghany.tazkeer.** { *; }
-keep class com.abdelghany.tazkeer.adhan.** { *; }
