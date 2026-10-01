import OpenInAppLanding from '@/app/OpenInAppLanding'

// Link universal (https://chat.wuzzhub.id/room/<id>) -> buka di web chat, atau halaman "Buka di Aplikasi" saat web dijeda
export default async function RoomLinkPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params
  return <OpenInAppLanding scheme="room" roomId={roomId} />
}
