import { redirect } from 'next/navigation'

// Link universal grup (https://chat.wuzzhub.id/room/<id>) -> buka di web chat
export default async function RoomLinkPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params
  redirect(`/chat?room=${encodeURIComponent(decodeURIComponent(roomId))}`)
}
