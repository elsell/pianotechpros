# Native audio peer dependency

The mobile application declares expo-asset 55.0.20 directly alongside expo-audio
55.0.18. This matches the installed Expo SDK 55 native manifest and the asset
version already resolved transitively. Expo Doctor requires native peer modules
as direct application dependencies so native builds outside Expo Go include them.

The native-set validator checks this exact pin and installed version. Expo Doctor,
clean prebuild, dependency-age and fresh Android/iOS compilation remain required;
transitive availability and successful JavaScript export are insufficient.
