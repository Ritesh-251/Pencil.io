import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Pencil.io API Documentation",
      version: "1.0.0",
      description:
        "Comprehensive API documentation for the Pencil.io collaborative platform.",
    },
    servers: [
      {
        url: process.env.API_URL || "http://localhost:3001",
        description: "Development server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  apis: ["./src/routes/*.ts", "./src/controller/*.ts"], // Path to the API docs
};

export const swaggerSpec = swaggerJsdoc(options);
