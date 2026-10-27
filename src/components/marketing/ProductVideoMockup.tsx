"use client";

import React, { useRef, useState } from "react";
import {
    Play,
    Pause,
    Volume2,
    VolumeX,
    Maximize,
    RotateCcw
} from "lucide-react";

interface ProductVideoMockupProps {
    videoSrc?: string;
    /** Percentage to crop off the top of the video to hide the browser bar (default: 7.2) */
    cropTopPercent?: number;
}

export function ProductVideoMockup({
    videoSrc = "/demo.mp4",
    cropTopPercent = 7.2
}: ProductVideoMockupProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [isPlaying, setIsPlaying] = useState<boolean>(true);
    const [isMuted, setIsMuted] = useState<boolean>(true);
    const [progress, setProgress] = useState<number>(0);
    const [currentTime, setCurrentTime] = useState<string>("0:00");
    const [duration, setDuration] = useState<string>("0:00");
    const [isHovered, setIsHovered] = useState<boolean>(false);
    const [hasError, setHasError] = useState<boolean>(false);

    // Format seconds to mm:ss
    const formatTime = (timeInSeconds: number) => {
        if (isNaN(timeInSeconds)) return "0:00";
        const minutes = Math.floor(timeInSeconds / 60);
        const seconds = Math.floor(timeInSeconds % 60);
        return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
    };

    const togglePlay = () => {
        if (!videoRef.current) return;
        if (videoRef.current.paused) {
            videoRef.current.play();
            setIsPlaying(true);
        } else {
            videoRef.current.pause();
            setIsPlaying(false);
        }
    };

    const toggleMute = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (!videoRef.current) return;
        videoRef.current.muted = !videoRef.current.muted;
        setIsMuted(videoRef.current.muted);
    };

    const handleRestart = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!videoRef.current) return;
        videoRef.current.currentTime = 0;
        videoRef.current.play();
        setIsPlaying(true);
    };

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
        if (!videoRef.current) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const clickPosition = (e.clientX - rect.left) / rect.width;
        videoRef.current.currentTime = clickPosition * videoRef.current.duration;
    };

    const toggleFullscreen = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!containerRef.current) return;
        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen?.();
        } else {
            document.exitFullscreen?.();
        }
    };

    const handleTimeUpdate = () => {
        if (!videoRef.current) return;
        const current = videoRef.current.currentTime;
        const total = videoRef.current.duration;
        if (total > 0) {
            setProgress((current / total) * 100);
            setCurrentTime(formatTime(current));
            setDuration(formatTime(total));
        }
    };

    const handleLoadedMetadata = () => {
        if (!videoRef.current) return;
        setDuration(formatTime(videoRef.current.duration));
    };

    // Calculate container aspect ratio so that width is 100% and bottom edge aligns with 0px gap
    // Original video is 1920 x 1080. Cropping top cropTopPercent% leaves (1 - cropTopPercent / 100) * 1080 height
    const visibleHeightRatio = cropTopPercent > 0 ? (1 - cropTopPercent / 100) * 1080 : 1080;
    const containerAspectRatio = `1920 / ${visibleHeightRatio}`;

    return (
        <div
            ref={containerRef}
            className="group relative w-full rounded-2xl md:rounded-3xl border border-white/10 bg-slate-950 shadow-[0_20px_70px_-15px_rgba(79,70,229,0.3)] backdrop-blur-xl overflow-hidden transition-all duration-300"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Ambient subtle glow around frame */}
            <div className="absolute -inset-1 bg-linear-to-r from-indigo-500/20 via-cyan-500/20 to-indigo-500/20 rounded-3xl blur-xl opacity-60 -z-10" />

            {/* Video Viewport Container */}
            <div
                className="relative w-full bg-slate-950 overflow-hidden cursor-pointer"
                style={{ aspectRatio: containerAspectRatio }}
                onClick={togglePlay}
            >
                {/* 
                  Video with full 100% width (0% horizontal crop) so Outlayd logo is NEVER cut on the left!
                  Top is shifted up slightly by -cropTopPercent% to eliminate the recorded browser URL bar.
                */}
                <video
                    ref={videoRef}
                    src={videoSrc}
                    playsInline
                    autoPlay
                    loop
                    muted={isMuted}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onError={() => setHasError(true)}
                    style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        width: "100%",
                        top: `-${cropTopPercent}%`,
                        height: `${100 + cropTopPercent}%`,
                        objectFit: "fill"
                    }}
                    className="select-none"
                />

                {/* Error Fallback */}
                {hasError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950/90 z-10">
                        <p className="text-white font-medium mb-1">Video File Needed</p>
                        <p className="text-xs text-slate-400 max-w-sm">
                            Ensure <code className="text-indigo-300">public/demo.mp4</code> is present.
                        </p>
                    </div>
                )}

                {/* Big Center Play Button Overlay when Paused */}
                {!isPlaying && (
                    <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center z-10 pointer-events-none transition-all">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-indigo-600/90 border border-indigo-400/40 text-white flex items-center justify-center shadow-[0_0_40px_rgba(79,70,229,0.6)] backdrop-blur-md transform transition-transform duration-300 hover:scale-110 active:scale-95">
                                <Play className="w-7 h-7 sm:w-8 sm:h-8 fill-current ml-1" />
                            </div>
                            <span className="text-xs font-semibold uppercase tracking-wider text-slate-200 bg-slate-950/80 px-3 py-1 rounded-full border border-white/10 backdrop-blur-md">
                                Click to Resume
                            </span>
                        </div>
                    </div>
                )}

                {/* Mute Indicator Pill (Visible if muted and playing) */}
                {isMuted && isPlaying && (
                    <div className="absolute top-4 right-4 z-20">
                        <button
                            onClick={toggleMute}
                            id="video-unmute-badge"
                            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-950/80 hover:bg-slate-900 border border-white/15 text-xs text-slate-300 hover:text-white backdrop-blur-md shadow-lg transition-all cursor-pointer active:scale-95"
                        >
                            <VolumeX className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Click to unmute</span>
                        </button>
                    </div>
                )}

                {/* Bottom Custom Control Bar (Slides in on hover or when paused) */}
                <div
                    className={`absolute bottom-0 inset-x-0 bg-linear-to-t from-slate-950/95 via-slate-950/80 to-transparent p-4 sm:p-5 z-20 transition-all duration-300 flex flex-col gap-2 ${
                        isHovered || !isPlaying ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
                    }`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Scrub Timeline */}
                    <div
                        className="w-full h-1.5 hover:h-2.5 bg-white/20 hover:bg-white/30 rounded-full cursor-pointer relative transition-all group/scrub"
                        onClick={handleSeek}
                    >
                        <div
                            className="h-full bg-linear-to-r from-indigo-500 to-cyan-400 rounded-full relative"
                            style={{ width: `${progress}%` }}
                        >
                            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md scale-0 group-hover/scrub:scale-100 transition-transform" />
                        </div>
                    </div>

                    {/* Controls Row */}
                    <div className="flex items-center justify-between text-xs text-slate-300 pt-1">
                        <div className="flex items-center gap-3">
                            {/* Play/Pause Button */}
                            <button
                                onClick={togglePlay}
                                id="video-play-pause-btn"
                                className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors cursor-pointer"
                                title={isPlaying ? "Pause" : "Play"}
                            >
                                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                            </button>

                            {/* Restart Button */}
                            <button
                                onClick={handleRestart}
                                id="video-restart-btn"
                                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                                title="Restart"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                            </button>

                            {/* Volume Toggle */}
                            <button
                                onClick={toggleMute}
                                id="video-volume-btn"
                                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                                title={isMuted ? "Unmute" : "Mute"}
                            >
                                {isMuted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-indigo-400" />}
                            </button>

                            {/* Timestamp */}
                            <span className="font-mono text-[11px] text-slate-400 select-none">
                                {currentTime} / {duration}
                            </span>
                        </div>

                        <div className="flex items-center gap-2">
                            {/* Fullscreen Button */}
                            <button
                                onClick={toggleFullscreen}
                                id="video-fullscreen-btn"
                                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                                title="Fullscreen"
                            >
                                <Maximize className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
