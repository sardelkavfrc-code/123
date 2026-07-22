!macro customInstall
  DetailPrint "Registering VK Music Context Menu..."
  
  ; For audio files (.mp3, .wav, .flac, etc.)
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\audio\shell\VKMusic" "" "Открыть в VK Music"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\audio\shell\VKMusic" "Icon" '"$INSTDIR\VK Music.exe"'
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\audio\shell\VKMusic\command" "" '"$INSTDIR\VK Music.exe" "%1"'
  
  ; For directories
  WriteRegStr HKCU "Software\Classes\Directory\shell\VKMusic" "" "Открыть в VK Music"
  WriteRegStr HKCU "Software\Classes\Directory\shell\VKMusic" "Icon" '"$INSTDIR\VK Music.exe"'
  WriteRegStr HKCU "Software\Classes\Directory\shell\VKMusic\command" "" '"$INSTDIR\VK Music.exe" "%1"'
!macroend

!macro customUnInstall
  DetailPrint "Unregistering VK Music Context Menu..."
  
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\audio\shell\VKMusic"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\VKMusic"
!macroend
