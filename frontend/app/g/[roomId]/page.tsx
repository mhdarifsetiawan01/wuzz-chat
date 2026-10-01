import OpenInAppLanding from '@/app/OpenInAppLanding'

// Link universal (https://chat.wuzzhub.id/g/<id>) -> buka di web chat, atau halaman "Buka di Aplikasi" saat web dijeda
export default async function GLinkPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params
  return <OpenInAppLanding scheme="g" roomId={roomId} />
}
