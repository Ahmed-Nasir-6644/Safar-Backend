/**
 * Ticket Controller
 *
 * Handles HTTP layer for ticket booking.
 * All payment processing is delegated to ticketService.
 */

const ticketService = require('../services/ticketService');
const { PaymentMethod } = require('../constants/paymentMethod');

class TicketController {
  /**
   * POST /tickets
   *
   * Create a new ticket booking with optional payment method.
   *
   * Request body:
   * {
   *   startStop:       string  (required)
   *   endStop:         string  (required)
   *   fare:            number  (required, PKR)
   *   busSequence?:    string[]
   *   currency?:       string  (default "PKR")
   *   paymentMethod?:  string  (default "pay_on_stop")
   * }
   *
   * Response:
   * {
   *   success: true,
   *   message: string,
   *   data: {
   *     ticketNumber, startStop, endStop, fare, currency,
   *     busSequence, payment: { method, status, qrCodeImage?, qrPayload? }
   *   }
   * }
   */
  async createTicket(req, res) {
    try {
      const {
        startStop,
        endStop,
        fare,
        busSequence   = [],
        currency      = 'PKR',
        paymentMethod = PaymentMethod.PAY_ON_STOP,
      } = req.body;

      const userId = req.user?.userId || null;

      if (!startStop || !endStop) {
        return res.status(400).json({
          success: false,
          message: 'startStop and endStop are required',
        });
      }

      if (fare === undefined || fare === null) {
        return res.status(400).json({
          success: false,
          message: 'fare is required',
        });
      }

      const fareNum = Number(fare);
      if (Number.isNaN(fareNum) || fareNum < 0) {
        return res.status(400).json({
          success: false,
          message: 'fare must be a non-negative number',
        });
      }

      const ticket = await ticketService.createTicket({
        userId,
        startStop,
        endStop,
        busSequence: Array.isArray(busSequence) ? busSequence : [],
        fare:         fareNum,
        currency,
        paymentMethod,
      });

      return res.status(201).json({
        success: true,
        message: 'Ticket created successfully',
        data:    ticket,
      });

    } catch (error) {
      // Surface validation errors as 400, unexpected errors as 500
      const status = error.message.startsWith('Invalid paymentMethod') ||
                     error.message.includes('required')
        ? 400
        : 500;

      console.error('❌ Create ticket error:', error);
      return res.status(status).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * GET /tickets/:ticketNumber
   *
   * Retrieve a single ticket by its ticket number.
   */
  async getTicket(req, res) {
    try {
      const { ticketNumber } = req.params;
      const ticket = await ticketService.getTicketByNumber(ticketNumber);

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: `Ticket ${ticketNumber} not found`,
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Ticket retrieved successfully',
        data:    ticket,
      });
    } catch (error) {
      console.error('❌ Get ticket error:', error);
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * GET /tickets/my
   *
   * Retrieve all tickets for the authenticated user.
   */
  async getMyTickets(req, res) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
      }

      const tickets = await ticketService.getTicketsByUser(userId);

      return res.status(200).json({
        success: true,
        message: `Retrieved ${tickets.length} ticket(s)`,
        data:    tickets,
      });
    } catch (error) {
      console.error('❌ Get my tickets error:', error);
      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
}

module.exports = new TicketController();
