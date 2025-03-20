import React, { useEffect, useRef, useState } from 'react';
import Confetti from './Confetti';

const CameraFeed = ({ onCapture, wordLength = 5 }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const processingRef = useRef(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [captureStatus, setCaptureStatus] = useState('idle'); // 'idle', 'capturing', 'waiting'
  const [wordCaptured, setWordCaptured] = useState([]);
  const [timerDisplay, setTimerDisplay] = useState('');
  const timerRef = useRef(null);
  const hasDetectedSignRef = useRef(false);
  
  // Audio for successful sign detection
  const playSuccessSound = () => {
    const audio = new Audio('/success-sound.mp3');
    audio.volume = 0.5;
    audio.play().catch(e => console.log('Audio play failed:', e));
  };

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: 640,
            height: 480,
            facingMode: 'user'
          } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
      }
    };

    startCamera();

    return () => {
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let frameId;

    const processFrame = async () => {
      if (!videoRef.current || !canvasRef.current || processingRef.current) {
        frameId = requestAnimationFrame(processFrame);
        return;
      }

      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      context.clearRect(0, 0, canvas.width, canvas.height);
      
      context.save();
      context.scale(-1, 1);
      context.drawImage(videoRef.current, -canvas.width, 0, canvas.width, canvas.height);
      context.restore();

      // Only process frames if we're capturing and haven't detected a sign yet
      if (isCapturing && captureStatus === 'capturing' && !hasDetectedSignRef.current) {
        try {
          processingRef.current = true;
          
          const boxSize = 300;
          const x = (canvas.width - boxSize) / 2;
          const y = (canvas.height - boxSize) / 2;
          const frameData = context.getImageData(x, y, boxSize, boxSize);
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = boxSize;
          tempCanvas.height = boxSize;
          const tempContext = tempCanvas.getContext('2d');
          tempContext.putImageData(frameData, 0, 0);

          const blob = await new Promise(resolve => tempCanvas.toBlob(resolve, 'image/jpeg'));
          const formData = new FormData();
          formData.append('frame', blob);

          const response = await fetch('http://localhost:5000/process-frame', {
            method: 'POST',
            body: formData
          });

          const result = await response.json();
          
          if (result.letter && result.confidence > 0.7) {
            hasDetectedSignRef.current = true;  // Mark that we've detected a sign
            
            // Update the word captured array
            const newWordCaptured = [...wordCaptured];
            newWordCaptured[currentIndex] = result.letter;
            setWordCaptured(newWordCaptured);
            
            // Notify parent component
            onCapture(result.letter, currentIndex);
            
            // Play success sound - we're not showing confetti here anymore
            playSuccessSound();
          }
        } catch (error) {
          console.error('Error processing frame:', error);
        } finally {
          processingRef.current = false;
        }
      }

      const boxSize = 300;
      const x = (canvas.width - boxSize) / 2;
      const y = (canvas.height - boxSize) / 2;
      
      // Determine box color based on capture status
      let boxColor = '#ff0000'; // Red when not capturing
      if (isCapturing) {
        if (captureStatus === 'capturing') {
          boxColor = '#00ff00'; // Green when capturing
        } else if (captureStatus === 'waiting') {
          boxColor = '#ffaa00'; // Orange when waiting
        }
      }
      
      context.strokeStyle = boxColor;
      context.lineWidth = 3;
      context.strokeRect(x, y, boxSize, boxSize);

      context.fillStyle = 'white';
      context.font = '20px Arial';
      context.textAlign = 'center';
      
      let text = 'Click Start to begin';
      if (isCapturing) {
        if (captureStatus === 'capturing') {
          text = `Show sign ${currentIndex + 1}/${wordLength} ${timerDisplay}`;
        } else if (captureStatus === 'waiting') {
          text = `Wait for next sign ${timerDisplay}`;
        } else if (currentIndex >= wordLength) {
          text = 'Capture complete!';
        }
      }
      context.fillText(text, canvas.width / 2, y - 10);

      // Display captured letters
      if (wordCaptured.length > 0) {
        context.font = '24px Arial';
        context.fillText(wordCaptured.join(' '), canvas.width / 2, canvas.height - 20);
      }

      frameId = requestAnimationFrame(processFrame);
    };

    frameId = requestAnimationFrame(processFrame);

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [isCapturing, onCapture, captureStatus, currentIndex, wordLength, wordCaptured, timerDisplay]);

  const startCaptureCycle = () => {
    // Reset detection flag at the start of each capture cycle
    hasDetectedSignRef.current = false;
    
    // Start capturing
    setCaptureStatus('capturing');
    let timeLeft = 2; // 2 seconds capture time
    
    const updateTimer = () => {
      setTimerDisplay(`(${timeLeft}s)`);
      timeLeft -= 1;
      
      if (timeLeft >= 0) {
        timerRef.current = setTimeout(updateTimer, 1000);
      } else {
        // Capture time is up, move to waiting state
        if (currentIndex < wordLength - 1) {
          setCaptureStatus('waiting');
          let waitTime = 3; // 3 seconds wait time
          
          const updateWaitTimer = () => {
            setTimerDisplay(`(${waitTime}s)`);
            waitTime -= 1;
            
            if (waitTime >= 0) {
              timerRef.current = setTimeout(updateWaitTimer, 1000);
            } else {
              // Move to next letter
              setCurrentIndex(prevIndex => prevIndex + 1);
              startCaptureCycle(); // Start next capture cycle
            }
          };
          
          timerRef.current = setTimeout(updateWaitTimer, 1000);
        } else {
          // All letters captured
          setCaptureStatus('idle');
          setIsCapturing(false);
        }
      }
    };
    
    timerRef.current = setTimeout(updateTimer, 1000);
    setTimerDisplay('(2s)');
  };

  const toggleCapture = () => {
    if (!isCapturing) {
      // Starting new capture
      setIsCapturing(true);
      setCurrentIndex(0);
      setWordCaptured([]);
      startCaptureCycle();
    } else {
      // Stopping capture
      setIsCapturing(false);
      setCaptureStatus('idle');
      setTimerDisplay('');
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    }
  };

  return (
    <div style={{ 
      position: 'relative',
      width: '640px',
      height: '480px',
      border: '2px solid #ccc',
      borderRadius: '8px',
      overflow: 'hidden'
    }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{
          width: '100%',
          height: '100%',
          transform: 'scaleX(-1)',
          display: 'none'
        }}
      />
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        style={{
          width: '100%',
          height: '100%'
        }}
      />
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2
      }}>
        <button
          onClick={toggleCapture}
          style={{
            padding: '10px 20px',
            fontSize: '1.1rem',
            backgroundColor: isCapturing ? '#ff4444' : '#44aa44',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          {isCapturing ? 'Stop Capture' : 'Start Capture'}
        </button>
      </div>
    </div>
  );
};

export default CameraFeed;
