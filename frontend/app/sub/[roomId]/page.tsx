import OpenInAppLanding from '@/app/OpenInAppLanding'

// Link universal (https://chat.wuzzhub.id/sub/<id>) -> buka di web chat, atau halaman "Buka di Aplikasi" saat web dijeda
export default async function SubLinkPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params
  return <OpenInAppLanding scheme="sub" roomId={roomId} />
}
