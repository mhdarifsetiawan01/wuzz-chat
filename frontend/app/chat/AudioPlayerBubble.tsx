'use client'

import React, { useState, useRef, useEffect } from 'react'

interface AudioPlayerBubbleProps {
  audioUrl: string
  fileName?: string
  isSelf?: boolean
}

// Format detik ke format mm:ss
function formatAudioTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

export const AudioPlayerBubble: React.FC<AudioPlayerBubbleProps> = ({
  audioUrl,
  fileName,
  isSelf = false,
}) => {
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [playbackRate, setPlaybackRate] = useState<1 | 1.5 | 2>(1)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const audio = new Audio(audioUrl)
    audioRef.current = audio

    const handleLoadedMetadata = () => {
      if (!isNaN(audio.duration) && isFinite(audio.duration)) {
        setDuration(audio.duration)
      }
    }

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
    }

    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.pause()
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
    }
  }, [audioUrl])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      // Pause any other playing audio on the page for clean UX
      document.querySelectorAll('audio').forEach((el) => {
        if (el !== audio) el.pause()
      })
      audio.playbackRate = playbackRate
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false))
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current
    if (!audio) return
    const seekTime = Number(e.target.value)
    audio.currentTime = seekTime
    setCurrentTime(seekTime)
  }

  const togglePlaybackRate = (e: React.MouseEvent) => {
    e.stopPropagation()
    const rates: Array<1 | 1.5 | 2> = [1, 1.5, 2]
    const nextRate = rates[(rates.indexOf(playbackRate) + 1) % rates.length]
    setPlaybackRate(nextRate)
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate
    }
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div
      className={`voice-player-bubble ${isSelf ? 'voice-player-self' : 'voice-player-peer'}`}
      role="region"
      aria-label="Pesan Suara (Voice Note)"
    >
      {/* Tombol Play / Pause */}
      <button
        type="button"
        className={`voice-play-btn ${isPlaying ? 'voice-playing' : ''}`}
        onClick={togglePlay}
        aria-label={isPlaying ? 'Jeda rekaman suara' : 'Putar rekaman suara'}
      >
        {isPlaying ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}>
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        )}
      </button>

      {/* Waveform Progress Area */}
      <div className="voice-waveform-wrapper">
        <div className="voice-scrubber-container">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="voice-scrubber-input"
            aria-label="Posisi pemutaran audio"
          />
          <div className="voice-waveform-track">
            {/* Simulated Dynamic Waveform Bars */}
            {[
              24, 40, 65, 30, 85, 45, 95, 70, 40, 60, 90, 50, 75, 35, 80, 100, 60, 45, 70, 90, 55, 35, 75, 45,
            ].map((height, i) => {
              const barPercent = (i / 24) * 100
              const isFilled = progressPercent >= barPercent
              return (
                <span
                  key={i}
                  className={`voice-waveform-bar ${isFilled ? 'bar-filled' : ''}`}
                  style={{ height: `${Math.max(height * 0.22, 4)}px` }}
                />
              )
            })}
          </div>
        </div>

        {/* Time Info & Speed Button */}
        <div className="voice-info-row">
          <span className="voice-time-text">
            {isPlaying || currentTime > 0
              ? `${formatAudioTime(currentTime)} / ${formatAudioTime(duration)}`
              : formatAudioTime(duration || 0)}
          </span>

          <button
            type="button"
            className="voice-speed-btn"
            onClick={togglePlaybackRate}
            title="Ubah kecepatan pemutaran"
          >
            {playbackRate}x
          </button>
        </div>
      </div>
    </div>
  )
}
