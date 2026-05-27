import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { jellyfin, JellyfinUser } from '../../services/jellyfin'
import { Loader2, Users } from 'lucide-react'

export default function SocialView() {
  const [users, setUsers] = useState<JellyfinUser[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const load = async () => {
      try {
        const data = await jellyfin.getUsers()
        setUsers(data)
      } catch (err) {
        console.error('Failed to load users:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="fade-in">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">Social</h1>
        <p className="text-sm text-text-secondary mt-1">Server users</p>
      </div>

      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 size={24} className="animate-spin text-text-tertiary" />
        </div>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-text-tertiary">
          <Users size={48} className="mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-text-secondary mb-1">No users found</h3>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {users.map(user => (
            <UserCard
              key={user.Id}
              user={user}
              onClick={() => navigate(`/social/user/${user.Id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function UserCard({ user, onClick }: { user: JellyfinUser; onClick: () => void }) {
  const imageUrl = user.PrimaryImageTag
    ? jellyfin.getUserImageUrl(user.Id, user.PrimaryImageTag)
    : null

  return (
    <div className="group cursor-pointer text-center" onClick={onClick}>
      <div className="relative aspect-square rounded-full overflow-hidden bg-bg-elevated mb-3 mx-auto shadow-lg shadow-black/20">
        {imageUrl ? (
          <img src={imageUrl} className="w-full h-full object-cover" alt="" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-bg-elevated to-bg-tertiary">
            <span className="text-4xl">👤</span>
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-full" />
      </div>
      <p className="text-sm font-medium truncate">{user.Name}</p>
    </div>
  )
}
