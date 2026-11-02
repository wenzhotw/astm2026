#!/bin/sh
# 最後一步：畫面＋英文旁白＋配樂（旁白出現時自動壓低）＋燒入中文字幕
set -e
ffmpeg -y -v error -i out/nosub.mp4 -i out/voice_en.wav -i out/music.wav -filter_complex \
 "[1:a]aresample=44100,pan=stereo|c0=c0|c1=c0,asplit=2[v][sc];[2:a]volume=0.30[m];[m][sc]sidechaincompress=threshold=0.02:ratio=5:attack=30:release=500[md];[v][md]amix=inputs=2:normalize=0,alimiter=limit=0.95[a];[0:v]ass=out/subs_en.ass[vo]" \
 -map "[vo]" -map "[a]" -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart out/final.tmp.mp4
mv out/final.tmp.mp4 "out/ASTM2026_系統介紹.mp4"
echo "完成：out/ASTM2026_系統介紹.mp4"
