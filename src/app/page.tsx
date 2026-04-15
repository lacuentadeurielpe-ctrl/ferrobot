// La ruta raíz redirige al dashboard (el middleware maneja la autenticación)
import { redirect } from 'next/navigation'

export default function HomePage() {
  redirect('/dashboard')
}
