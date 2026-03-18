
import { verifyToken } from "@repo/auth";


export function verifySocketToken(token: string) {
  try {
   const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET;
  

    if(!accessTokenSecret){
      throw new Error("Server misconfigured");
    }


    const decoded = verifyToken(token, accessTokenSecret);

    const userId = typeof decoded === "string" ? undefined : decoded.sub;
    if (typeof userId !== "string") {
     throw new Error("Invalid token");
    }
    return userId;


   
  } catch (error) {
    throw new Error("System went wrong here");
  }
}
