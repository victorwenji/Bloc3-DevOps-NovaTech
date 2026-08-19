import React, { useState } from 'react'
import axios from 'axios'
import './Login.css'

const API_URL = process.env.REACT_APP_API_URL || '/api'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)

  const handleLogin = async (e) => {
    e.preventDefault()
    try {
      const { data } = await axios.post(`${API_URL}/auth/login`, { email, password })
      localStorage.setItem('hrflow_token', data.token)
      localStorage.setItem('hrflow_user', JSON.stringify(data.user))
      window.location.href = '/dashboard'
    } catch (err) {
      setError('Identifiants invalides')
      console.error('Login error:', err.response?.data)
    }
  }

  return (
    <div className="login-container">
      <h1>HRFlow</h1>
      <form onSubmit={handleLogin}>
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <input type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} />
        {error && <p className="error">{error}</p>}
        <button type="submit">Connexion</button>
      </form>
    </div>
  )
}
