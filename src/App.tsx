import { CameraView } from './components/CameraView'

function App() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: '#0f172a' }}
    >
      <CameraView landmarks={null} gestureName={null} onReady={() => {}} />
    </div>
  )
}

export default App
