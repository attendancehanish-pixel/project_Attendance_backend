import prisma from '../lib/prisma.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { resolvePermissions } from '../permissions/resolve.js';

async function loadUser(id) {
  return prisma.user.findUnique({
    where: { id },
    include: {
      userRoles: {
        include: {
          role: { 
            include: { 
              permissions: { 
                include: { 
                  permission: true 
                } 
              } 
            } 
          },
        },
      },
    },
  });
}

export const authenticate = async (req, res, next) => {
  try {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    const p = verifyAccessToken(h.slice(7));
    const user = await loadUser(p.sub);
    
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Invalid account' });
    }
    
    req.user = user;
    next();
  } catch (e) {
    res.status(401).json({ message: 'Invalid or expired access token' });
  }
};

export const getUserPermissions = (user) => resolvePermissions(user);
